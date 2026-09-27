using System.Diagnostics;
using System.Text.Json;
using Microsoft.Windows.AppLifecycle;
using Microsoft.Windows.AppNotifications;
using Microsoft.Windows.PushNotifications;
using Windows.ApplicationModel;

internal sealed record BridgeConfig(string ObjectId, string Protocol);

internal static class Program
{
    private static readonly TaskCompletionSource<bool> ActivationHandled =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    [STAThread]
    public static async Task<int> Main(string[] args)
    {
        try
        {
            var config = LoadConfig();
            var command = args.FirstOrDefault(a => !a.StartsWith("----", StringComparison.OrdinalIgnoreCase)) ?? "activation";
            var systemActivation = args.Any(a => a.StartsWith("----", StringComparison.OrdinalIgnoreCase));

            // Development/diagnostic direct invocation. Production Yamachat uses
            // package activation + the local request/response files below.
            if (string.Equals(command, "status", StringComparison.OrdinalIgnoreCase))
            {
                var family = TryPackageFamilyName();
                Console.WriteLine(JsonSerializer.Serialize(new
                {
                    ok = true,
                    packageFamilyName = family,
                    hasPackageIdentity = !string.IsNullOrWhiteSpace(family),
                    objectIdConfigured = Guid.TryParse(config.ObjectId, out var parsed) && parsed != Guid.Empty
                }));
                return 0;
            }

            // A normal AppsFolder activation is how the unpackaged Electron client
            // asks the sparse package host for a WNS channel. Windows starts this
            // executable with the registered package identity, so production does
            // not need an unsigned <msix> element embedded in the EXE manifest.
            if (!systemActivation)
            {
                var requestHandled = await TryHandlePendingRequestAsync(config);
                if (requestHandled.HasValue) return requestHandled.Value;
            }

            AppNotificationManager.Default.NotificationInvoked += (_, eventArgs) =>
            {
                try { LaunchYamachat(eventArgs.Argument); }
                finally { ActivationHandled.TrySetResult(true); }
            };

            try
            {
                AppNotificationManager.Default.Register();
            }
            catch (Exception ex)
            {
                if (args.Any(a => a.StartsWith("----AppNotificationActivated:", StringComparison.OrdinalIgnoreCase)))
                {
                    WriteError("app-notification-register", ex);
                    return 30;
                }
            }

            if (PushNotificationManager.IsSupported())
            {
                PushNotificationManager.Default.PushReceived += (_, eventArgs) =>
                {
                    var deferral = eventArgs.GetDeferral();
                    try
                    {
                        // Cloud-sourced Yamachat notifications are toast payloads handled by Windows.
                        // Raw payload support stays registered as a safe fallback for future use.
                    }
                    catch { }
                    finally
                    {
                        deferral.Complete();
                    }
                };

                PushNotificationManager.Default.Register();
            }

            if (string.Equals(command, "register", StringComparison.OrdinalIgnoreCase))
            {
                var result = await CreateChannelResultAsync(config);
                Console.WriteLine(JsonSerializer.Serialize(result));
                return ResultOk(result) ? 0 : 22;
            }

            // COM activation paths used by Windows for background push / notification click.
            if (args.Any(a => a.StartsWith("----WindowsAppRuntimePushServer:", StringComparison.OrdinalIgnoreCase)) ||
                args.Any(a => a.StartsWith("----AppNotificationActivated:", StringComparison.OrdinalIgnoreCase)))
            {
                _ = Microsoft.Windows.AppLifecycle.AppInstance.GetCurrent().GetActivatedEventArgs();
                await Task.WhenAny(ActivationHandled.Task, Task.Delay(TimeSpan.FromSeconds(12)));
                return 0;
            }

            return 0;
        }
        catch (Exception ex)
        {
            WriteError("bridge-fatal", ex);
            return 99;
        }
        finally
        {
            try { PushNotificationManager.Default.Unregister(); } catch { }
            try { AppNotificationManager.Default.Unregister(); } catch { }
        }
    }

    private static async Task<int?> TryHandlePendingRequestAsync(BridgeConfig config)
    {
        var directory = IpcDirectory();
        Directory.CreateDirectory(directory);

        foreach (var file in Directory.EnumerateFiles(directory, "request-*.json")
                     .OrderByDescending(File.GetLastWriteTimeUtc)
                     .Take(8))
        {
            string requestId = "";
            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(file));
                var root = document.RootElement;
                requestId = root.TryGetProperty("requestId", out var id) ? id.GetString() ?? "" : "";
                var action = root.TryGetProperty("action", out var a) ? a.GetString() ?? "" : "";

                if (requestId.Length != 32 || requestId.Any(ch => !Uri.IsHexDigit(ch)))
                {
                    TryDelete(file);
                    continue;
                }

                object response;
                if (string.Equals(action, "status", StringComparison.OrdinalIgnoreCase))
                {
                    var family = TryPackageFamilyName();
                    response = new
                    {
                        ok = true,
                        packageFamilyName = family,
                        hasPackageIdentity = !string.IsNullOrWhiteSpace(family),
                        objectIdConfigured = Guid.TryParse(config.ObjectId, out var parsed) && parsed != Guid.Empty
                    };
                }
                else if (string.Equals(action, "register", StringComparison.OrdinalIgnoreCase))
                {
                    response = await CreateChannelResultAsync(config);
                }
                else
                {
                    response = new { ok = false, error = "unsupported-action" };
                }

                WriteIpcResponse(directory, requestId, response);
                return 0;
            }
            catch (Exception ex)
            {
                if (requestId.Length == 32)
                {
                    WriteIpcResponse(directory, requestId, new
                    {
                        ok = false,
                        error = "bridge-request-failed",
                        detail = ex.GetType().Name
                    });
                    return 0;
                }
            }
            finally
            {
                TryDelete(file);
            }
        }

        return null;
    }

    private static async Task<object> CreateChannelResultAsync(BridgeConfig config)
    {
        var family = TryPackageFamilyName();
        if (string.IsNullOrWhiteSpace(family))
            return new { ok = false, error = "wns-package-identity-missing" };

        if (!PushNotificationManager.IsSupported())
            return new { ok = false, error = "wns-not-supported", packageFamilyName = family };

        if (!Guid.TryParse(config.ObjectId, out var objectId) || objectId == Guid.Empty)
            return new { ok = false, error = "wns-object-id-not-configured", packageFamilyName = family };

        try
        {
            PushNotificationManager.Default.Register();
            var result = await PushNotificationManager.Default.CreateChannelAsync(objectId);

            if (result.Status != PushNotificationChannelStatus.CompletedSuccess || result.Channel is null)
            {
                return new
                {
                    ok = false,
                    error = "wns-channel-failed",
                    status = result.Status.ToString(),
                    extendedError = result.ExtendedError?.HResult ?? 0,
                    packageFamilyName = family
                };
            }

            return new
            {
                ok = true,
                channelUri = result.Channel.Uri.ToString(),
                expiresAt = result.Channel.ExpirationTime.ToUniversalTime().ToString("O"),
                packageFamilyName = family
            };
        }
        catch (Exception ex)
        {
            return new
            {
                ok = false,
                error = "wns-channel-exception",
                hresult = ex.HResult,
                packageFamilyName = family
            };
        }
        finally
        {
            try { PushNotificationManager.Default.Unregister(); } catch { }
        }
    }

    private static bool ResultOk(object result)
    {
        try
        {
            var json = JsonSerializer.SerializeToElement(result);
            return json.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True;
        }
        catch
        {
            return false;
        }
    }

    private static string IpcDirectory() =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Yamachat",
            "wns-ipc");

    private static void WriteIpcResponse(string directory, string requestId, object response)
    {
        Directory.CreateDirectory(directory);
        var target = Path.Combine(directory, $"response-{requestId}.json");
        var temp = target + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(response));
        File.Move(temp, target, true);
    }

    private static void TryDelete(string file)
    {
        try { if (File.Exists(file)) File.Delete(file); } catch { }
    }

    private static BridgeConfig LoadConfig()
    {
        var file = Path.Combine(AppContext.BaseDirectory, "wns-config.json");
        if (!File.Exists(file)) return new BridgeConfig("", "yamachat");

        using var doc = JsonDocument.Parse(File.ReadAllText(file));
        var root = doc.RootElement;
        var objectId = root.TryGetProperty("objectId", out var id) ? id.GetString() ?? "" : "";
        var protocol = root.TryGetProperty("protocol", out var p) ? p.GetString() ?? "yamachat" : "yamachat";
        return new BridgeConfig(objectId, protocol);
    }

    private static string TryPackageFamilyName()
    {
        try { return Package.Current.Id.FamilyName; }
        catch { return ""; }
    }

    private static void LaunchYamachat(string? argument)
    {
        var value = (argument ?? "").Trim();
        if (!value.StartsWith("yamachat://notification", StringComparison.OrdinalIgnoreCase))
            return;

        Process.Start(new ProcessStartInfo(value)
        {
            UseShellExecute = true
        });
    }

    private static void WriteError(string kind, Exception ex)
    {
        Console.Error.WriteLine(JsonSerializer.Serialize(new
        {
            ok = false,
            error = kind,
            message = ex.Message,
            hresult = ex.HResult
        }));
    }
}
