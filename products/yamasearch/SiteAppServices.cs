using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Windows.Media.Imaging;

namespace YamaSearch;

public static class SiteAppServices
{
    private static readonly HttpClient Client = new() { Timeout = TimeSpan.FromSeconds(12) };

    public static string AppsRoot =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YamaSearch", "SiteApps");

    public static string GetAppDirectory(string appId) => Path.Combine(AppsRoot, appId);

    public static async Task<string> PrepareIconAsync(SiteAppEntry app, string? faviconUrl)
    {
        var directory = GetAppDirectory(app.Id);
        Directory.CreateDirectory(directory);
        var iconPath = Path.Combine(directory, "app.ico");

        if (Uri.TryCreate(faviconUrl, UriKind.Absolute, out var favicon)
            && favicon.Scheme is "http" or "https")
        {
            try
            {
                var bytes = await Client.GetByteArrayAsync(favicon);
                var png = ConvertImageToPng(bytes);
                if (png.Length > 0)
                {
                    WritePngBackedIcon(iconPath, png);
                    app.FaviconUrl = favicon.ToString();
                    app.IconPath = iconPath;
                    return iconPath;
                }
            }
            catch
            {
                // Fallback below.
            }
        }

        var fallback = Path.Combine(AppContext.BaseDirectory, "Assets", "YamaSearch.ico");
        if (File.Exists(fallback))
        {
            File.Copy(fallback, iconPath, true);
            app.IconPath = iconPath;
            return iconPath;
        }

        app.IconPath = "";
        return "";
    }

    public static void ApplyShortcuts(SiteAppEntry app)
    {
        var exe = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(exe) || !File.Exists(exe))
            throw new InvalidOperationException("YamaSearch nemohl zjistit cestu k vlastnímu EXE.");

        if (app.AddToStartMenu)
            CreateShortcut(GetStartMenuShortcutPath(app), exe, $"--app-id={app.Id}", app.IconPath);
        else
            DeleteFile(GetStartMenuShortcutPath(app));

        if (app.CreateDesktopShortcut)
            CreateShortcut(GetDesktopShortcutPath(app), exe, $"--app-id={app.Id}", app.IconPath);
        else
            DeleteFile(GetDesktopShortcutPath(app));

        if (app.StartOnLogin)
            CreateShortcut(GetStartupShortcutPath(app), exe, $"--app-id={app.Id}", app.IconPath);
        else
            DeleteFile(GetStartupShortcutPath(app));
    }

    public static void RemoveAppFiles(SiteAppEntry app)
    {
        DeleteFile(GetStartMenuShortcutPath(app));
        DeleteFile(GetDesktopShortcutPath(app));
        DeleteFile(GetStartupShortcutPath(app));

        try
        {
            var directory = GetAppDirectory(app.Id);
            if (Directory.Exists(directory))
                Directory.Delete(directory, true);
        }
        catch
        {
            // Non-fatal cleanup failure.
        }
    }

    public static bool TryPinToTaskbar(SiteAppEntry app)
    {
        try
        {
            app.AddToStartMenu = true;
            ApplyShortcuts(app);
            var shortcut = GetStartMenuShortcutPath(app);
            if (!File.Exists(shortcut)) return false;

            var script =
                "$s=(New-Object -ComObject Shell.Application);" +
                $"$f=$s.Namespace('{PsQuote(Path.GetDirectoryName(shortcut) ?? "")}').ParseName('{PsQuote(Path.GetFileName(shortcut))}');" +
                "if($null -eq $f){exit 2};" +
                "$f.InvokeVerb('taskbarpin');";
            var psi = new ProcessStartInfo("powershell.exe")
            {
                UseShellExecute = false,
                CreateNoWindow = true
            };
            psi.ArgumentList.Add("-NoProfile");
            psi.ArgumentList.Add("-NonInteractive");
            psi.ArgumentList.Add("-WindowStyle");
            psi.ArgumentList.Add("Hidden");
            psi.ArgumentList.Add("-Command");
            psi.ArgumentList.Add(script);
            using var process = Process.Start(psi);
            process?.WaitForExit(5000);
            return process?.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    public static void OpenShortcutLocation(SiteAppEntry app)
    {
        app.AddToStartMenu = true;
        ApplyShortcuts(app);
        var shortcut = GetStartMenuShortcutPath(app);
        if (File.Exists(shortcut))
            Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{shortcut}\"") { UseShellExecute = true });
    }

    public static string GetStartMenuShortcutPath(SiteAppEntry app)
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "YamaSearch Apps");
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, SafeFileName(app.Name) + ".lnk");
    }

    public static string GetDesktopShortcutPath(SiteAppEntry app)
        => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), SafeFileName(app.Name) + ".lnk");

    public static string GetStartupShortcutPath(SiteAppEntry app)
        => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), "YamaSearch - " + SafeFileName(app.Name) + ".lnk");

    public static string SafeFileName(string value)
    {
        var result = string.IsNullOrWhiteSpace(value) ? "Webová aplikace" : value.Trim();
        foreach (var invalid in Path.GetInvalidFileNameChars())
            result = result.Replace(invalid, '_');
        return result.Length > 70 ? result[..70] : result;
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string arguments, string? iconPath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(shortcutPath)!);
        var workingDirectory = Path.GetDirectoryName(targetPath) ?? AppContext.BaseDirectory;
        var icon = !string.IsNullOrWhiteSpace(iconPath) && File.Exists(iconPath) ? iconPath : targetPath;

        var command =
            "$w=New-Object -ComObject WScript.Shell;" +
            $"$s=$w.CreateShortcut('{PsQuote(shortcutPath)}');" +
            $"$s.TargetPath='{PsQuote(targetPath)}';" +
            $"$s.Arguments='{PsQuote(arguments)}';" +
            $"$s.WorkingDirectory='{PsQuote(workingDirectory)}';" +
            $"$s.IconLocation='{PsQuote(icon)},0';" +
            "$s.Save();";

        var psi = new ProcessStartInfo("powershell.exe")
        {
            UseShellExecute = false,
            CreateNoWindow = true
        };
        psi.ArgumentList.Add("-NoProfile");
        psi.ArgumentList.Add("-NonInteractive");
        psi.ArgumentList.Add("-WindowStyle");
        psi.ArgumentList.Add("Hidden");
        psi.ArgumentList.Add("-Command");
        psi.ArgumentList.Add(command);
        using var process = Process.Start(psi);
        process?.WaitForExit(5000);

        if (!File.Exists(shortcutPath))
            throw new IOException("Zástupce aplikace se nepodařilo vytvořit.");
    }

    private static string PsQuote(string value) => value.Replace("'", "''");

    private static void DeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
                File.Delete(path);
        }
        catch
        {
            // Non-fatal shortcut cleanup failure.
        }
    }

    private static byte[] ConvertImageToPng(byte[] source)
    {
        try
        {
            using var input = new MemoryStream(source, false);
            var decoder = BitmapDecoder.Create(input, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
            if (decoder.Frames.Count == 0) return [];

            var frame = decoder.Frames
                .OrderByDescending(x => x.PixelWidth * x.PixelHeight)
                .First();
            var encoder = new PngBitmapEncoder();
            encoder.Frames.Add(BitmapFrame.Create(frame));
            using var output = new MemoryStream();
            encoder.Save(output);
            return output.ToArray();
        }
        catch
        {
            return [];
        }
    }

    private static void WritePngBackedIcon(string path, byte[] png)
    {
        var width = ReadPngInt32(png, 16);
        var height = ReadPngInt32(png, 20);
        var widthByte = width >= 256 ? (byte)0 : (byte)Math.Clamp(width, 1, 255);
        var heightByte = height >= 256 ? (byte)0 : (byte)Math.Clamp(height, 1, 255);

        using var stream = File.Create(path);
        using var writer = new BinaryWriter(stream, Encoding.UTF8, leaveOpen: false);

        writer.Write((ushort)0); // reserved
        writer.Write((ushort)1); // icon
        writer.Write((ushort)1); // one image

        writer.Write(widthByte);
        writer.Write(heightByte);
        writer.Write((byte)0);
        writer.Write((byte)0);
        writer.Write((ushort)1);
        writer.Write((ushort)32);
        writer.Write(png.Length);
        writer.Write(22); // header + one directory entry
        writer.Write(png);
    }

    private static int ReadPngInt32(byte[] bytes, int offset)
    {
        if (bytes.Length < offset + 4) return 256;
        return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    }
}
