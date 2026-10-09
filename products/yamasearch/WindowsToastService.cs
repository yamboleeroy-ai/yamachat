using System.Diagnostics;
using System.Windows;
using CommunityToolkit.WinUI.Notifications;
using Microsoft.Web.WebView2.Core;

namespace YamaSearch;

/// <summary>
/// Bridges WebView's Web Notifications API to the Windows notification center.
/// The registration uses the same identity as the installed Start-menu shortcut.
/// </summary>
internal static class WindowsToastService
{
    private static readonly object Sync = new();
    private static readonly Dictionary<string, NotificationRoute> Routes = new();
    private static readonly Queue<string> RouteOrder = new();
    private static bool _registered;

    internal static bool TryInitialize()
    {
        lock (Sync)
        {
            if (_registered)
                return true;

            try
            {
                ToastNotificationManagerCompat.OnActivated += toast => Activate(toast.Argument);
                _registered = true;
                return true;
            }
            catch (Exception error)
            {
                Debug.WriteLine("Windows notifications could not be registered: " + error);
                return false;
            }
        }
    }

    internal static bool TryShow(BrowserTab tab, CoreWebView2NotificationReceivedEventArgs args, bool playSound)
    {
        if (!TryInitialize())
            return false;

        var notification = args.Notification;
        var origin = args.SenderOrigin;
        var deduplicationKey = CreateDeduplicationKey(origin, notification);
        lock (Sync)
        {
            if (Routes.ContainsKey(deduplicationKey))
            {
                args.Handled = true;
                try { notification.ReportClosed(); } catch { }
                return true;
            }

            var routeId = Guid.NewGuid().ToString("N");
            Routes[deduplicationKey] = new NotificationRoute(routeId, tab.Id, SafeUrl(tab), notification);
            RouteOrder.Enqueue(deduplicationKey);
            while (RouteOrder.Count > 128)
                Routes.Remove(RouteOrder.Dequeue());

            try
            {
                var title = string.IsNullOrWhiteSpace(notification.Title) ? HostLabel(origin) : notification.Title;
                var body = string.IsNullOrWhiteSpace(notification.Body) ? HostLabel(origin) : notification.Body;
                var builder = new ToastContentBuilder()
                    .AddText(title)
                    .AddText(body)
                    .AddAttributionText(HostLabel(origin))
                    .AddArgument("route", routeId)
                    .AddArgument("tab", tab.Id.ToString("N"));

                if (!playSound || notification.IsSilent)
                    builder.AddAudio(new ToastAudio { Silent = true });

                var logo = System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "YamaSearch-symbol-256.png");
                if (System.IO.File.Exists(logo))
                    builder.AddAppLogoOverride(new Uri(logo));

                // Tell WebView that the browser has taken responsibility only after
                // the native toast object is ready to be handed to Windows.
                args.Handled = true;
                builder.Show();
                notification.ReportShown();
                return true;
            }
            catch (Exception error)
            {
                Routes.Remove(deduplicationKey);
                args.Handled = false;
                Debug.WriteLine("Windows notification could not be shown: " + error);
                return false;
            }
        }
    }

    internal static void Activate(string arguments)
    {
        ToastArguments parsed;
        try { parsed = ToastArguments.Parse(arguments); }
        catch { return; }

        if (!parsed.TryGetValue("route", out var routeId))
            return;

        NotificationRoute? route;
        lock (Sync)
            route = Routes.Values.FirstOrDefault(item => item.RouteId == routeId);

        if (route is null)
            return;

        var app = Application.Current;
        if (app?.Dispatcher is null)
            return;

        app.Dispatcher.BeginInvoke(() =>
        {
            var target = app.Windows.OfType<MainWindow>().FirstOrDefault(window => window.ActivateNotificationTab(route.TabId));
            if (target is null && Uri.TryCreate(route.Url, UriKind.Absolute, out _))
                new MainWindow(route.Url).Show();

            try { route.Notification.ReportClicked(); }
            catch (Exception error) { Debug.WriteLine("Web notification click could not be reported: " + error); }
        });
    }

    private static string CreateDeduplicationKey(string origin, CoreWebView2Notification notification)
        => string.Join("|", origin, notification.Tag, notification.Title, notification.Body);

    private static string SafeUrl(BrowserTab tab)
        => tab.View.CoreWebView2?.Source ?? "";

    private static string HostLabel(string origin)
    {
        if (Uri.TryCreate(origin, UriKind.Absolute, out var uri))
            return uri.Host;
        return string.IsNullOrWhiteSpace(origin) ? "YamaSearch" : origin;
    }

    private sealed record NotificationRoute(string RouteId, Guid TabId, string Url, CoreWebView2Notification Notification);
}
