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
                    try
                    {
                        using var deferral = eventArgs.GetDeferral();
                        // Cloud-sourced Yamachat notifications are toast payloads handled by Windows.
                        // Raw payload support stays registered as a safe fallback for future use.
                        deferral.Complete();
                    }
                    catch { }
                };

                PushNotificationManager.Default.Register();
            }

            var command = args.FirstOrDefault(a => !a.StartsWith("----", StringComparison.OrdinalIgnoreCase)) ?? "activation";

            if (string.Equals(command, "status", StringComparison.OrdinalIgnoreCase))
            {
                var family = TryPackageFamilyName();
                Console.WriteLine(JsonSerializer.Serialize(new
                {
                    ok = true,
                    supported = PushNotificationManager.IsSupported(),
                    packageFamilyName = family,
                    hasPackageIdentity = !string.IsNullOrWhiteSpace(family),
                    objectIdConfigured = Guid.TryParse(config.ObjectId, out var parsed) && parsed != Guid.Empty
                }));
                return 0;
            }

            if (string.Equals(command, "register", StringComparison.OrdinalIgnoreCase))
            {
                if (!PushNotificationManager.IsSupported())
                {
                    Console.WriteLine(JsonSerializer.Serialize(new { ok = false, error = "wns-not-supported" }));
                    return 20;
                }

                if (!Guid.TryParse(config.ObjectId, out var objectId) || objectId == Guid.Empty)
                {
                    Console.WriteLine(JsonSerializer.Serialize(new { ok = false, error = "wns-object-id-not-configured" }));
                    return 21;
                }

                var result = await PushNotificationManager.Default.CreateChannelAsync(objectId);

                if (result.Status != PushNotificationChannelStatus.CompletedSuccess || result.Channel is null)
                {
                    Console.WriteLine(JsonSerializer.Serialize(new
                    {
                        ok = false,
                        error = "wns-channel-failed",
                        status = result.Status.ToString(),
                        extendedError = result.ExtendedError?.HResult ?? 0
                    }));
                    return 22;
                }

                Console.WriteLine(JsonSerializer.Serialize(new
                {
                    ok = true,
                    channelUri = result.Channel.Uri.ToString(),
                    expiresAt = result.Channel.ExpirationTime.ToUniversalTime().ToString("O"),
                    packageFamilyName = TryPackageFamilyName()
                }));
                return 0;
            }

            // COM activation paths used by Windows for background push / notification click.
            if (args.Any(a => a.StartsWith("----WindowsAppRuntimePushServer:", StringComparison.OrdinalIgnoreCase)) ||
                args.Any(a => a.StartsWith("----AppNotificationActivated:", StringComparison.OrdinalIgnoreCase)))
            {
                _ = AppInstance.GetCurrent().GetActivatedEventArgs();
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
