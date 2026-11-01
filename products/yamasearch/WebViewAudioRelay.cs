using NAudio.CoreAudioApi;
using NAudio.Wave;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.IO;

namespace YamaSearch;

internal sealed class WebViewAudioRelay : IDisposable
{
    private readonly int _browserPid;
    private readonly BufferedWaveProvider _buffer = new(new WaveFormat(48000, 16, 2))
    {
        BufferDuration = TimeSpan.FromMilliseconds(300),
        DiscardOnBufferOverflow = true
    };
    private readonly WaveOutEvent _output = new() { DesiredLatency = 60, NumberOfBuffers = 3 };
    private readonly CancellationTokenSource _stop = new();
    private readonly Dictionary<string, float> _sourceVolumes = [];
    private readonly object _sessionLock = new();
    private readonly System.Threading.Timer _sessionTimer;
    private Process? _capture;
    private volatile bool _captureReady;

    internal WebViewAudioRelay(int browserPid)
    {
        _browserPid = browserPid;
        _output.Init(_buffer);
        _output.Play();
        _sessionTimer = new(_ => RefreshSourceMute(), null, TimeSpan.Zero, TimeSpan.FromSeconds(1));
        StartCapture();
    }

    private void StartCapture()
    {
        var helper = Path.Combine(AppContext.BaseDirectory, "process-audio", "YamaSearch.ProcessAudioCapture.exe");
        if (!File.Exists(helper)) return;
        _capture = Process.Start(new ProcessStartInfo(helper, $"--pid {_browserPid}")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        });
        if (_capture is not null)
        {
            _capture.EnableRaisingEvents = true;
            _capture.Exited += (_, _) => { _captureReady = false; RestoreSourceMute(); };
            _ = WatchDiagnosticsAsync(_capture, _stop.Token);
            _ = PumpAsync(_capture, _stop.Token);
        }
    }

    private async Task WatchDiagnosticsAsync(Process process, CancellationToken token)
    {
        try
        {
            while (!token.IsCancellationRequested)
            {
                var line = await process.StandardError.ReadLineAsync(token);
                if (line is null) break;
                if (line.StartsWith("YAMACHAT_PROCESS_AUDIO_READY", StringComparison.Ordinal))
                    _captureReady = true;
            }
        }
        catch (OperationCanceledException) { }
        catch { }
    }

    private async Task PumpAsync(Process process, CancellationToken token)
    {
        var bytes = new byte[16384];
        try
        {
            while (!token.IsCancellationRequested)
            {
                var read = await process.StandardOutput.BaseStream.ReadAsync(bytes, token);
                if (read == 0) break;
                _buffer.AddSamples(bytes, 0, read);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception) { }
    }

    private void RefreshSourceMute()
    {
        if (!_captureReady) return;
        lock (_sessionLock)
        try
        {
            var descendants = ProcessTree.DescendantsOf(_browserPid);
            using var devices = new MMDeviceEnumerator();
            foreach (var device in devices.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
            {
                using (device)
                {
                    var sessions = device.AudioSessionManager.Sessions;
                    for (var i = 0; i < sessions.Count; i++)
                    {
                        using var session = sessions[i];
                        if (!descendants.Contains((int)session.GetProcessID)) continue;
                        var key = $"{device.ID}|{session.GetSessionIdentifier}";
                        if (!_sourceVolumes.ContainsKey(key)) _sourceVolumes[key] = session.SimpleAudioVolume.Volume;
                        session.SimpleAudioVolume.Volume = 0f;
                    }
                }
            }
        }
        catch { }
    }

    public void Dispose()
    {
        _stop.Cancel();
        _sessionTimer.Dispose();
        try { if (_capture is { HasExited: false }) _capture.Kill(true); } catch { }
        _capture?.Dispose();
        _output.Stop();
        _output.Dispose();
        RestoreSourceMute();
        _stop.Dispose();
    }

    private void RestoreSourceMute()
    {
        lock (_sessionLock)
        try
        {
            using var devices = new MMDeviceEnumerator();
            foreach (var device in devices.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
            using (device)
            {
                var sessions = device.AudioSessionManager.Sessions;
                for (var i = 0; i < sessions.Count; i++)
                using (var session = sessions[i])
                {
                    var key = $"{device.ID}|{session.GetSessionIdentifier}";
                    if (_sourceVolumes.TryGetValue(key, out var volume)) session.SimpleAudioVolume.Volume = volume;
                }
            }
        }
        catch { }
    }
}

internal static class ProcessTree
{
    private const uint Th32csSnapProcess = 0x00000002;
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ProcessEntry32
    {
        public uint Size, Usage, ProcessId;
        public nint DefaultHeapId;
        public uint ModuleId, Threads, ParentProcessId;
        public int BasePriority;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string ExeFile;
    }
    [DllImport("kernel32.dll", SetLastError = true)] private static extern nint CreateToolhelp32Snapshot(uint flags, uint processId);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool Process32FirstW(nint snapshot, ref ProcessEntry32 entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool Process32NextW(nint snapshot, ref ProcessEntry32 entry);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(nint handle);

    internal static HashSet<int> DescendantsOf(int root)
    {
        var result = new HashSet<int> { root };
        var rows = new List<(int Pid, int Parent)>();
        var snapshot = CreateToolhelp32Snapshot(Th32csSnapProcess, 0);
        if (snapshot == -1) return result;
        try
        {
            var entry = new ProcessEntry32 { Size = (uint)Marshal.SizeOf<ProcessEntry32>(), ExeFile = "" };
            if (Process32FirstW(snapshot, ref entry))
                do { rows.Add(((int)entry.ProcessId, (int)entry.ParentProcessId)); }
                while (Process32NextW(snapshot, ref entry));
        }
        finally { CloseHandle(snapshot); }

        var parents = new HashSet<int> { root };
        while (true)
        {
            var added = rows.Where(x => parents.Contains(x.Parent) && result.Add(x.Pid)).Select(x => x.Pid).ToArray();
            if (added.Length == 0) break;
            foreach (var pid in added) parents.Add(pid);
        }
        return result;
    }
}
