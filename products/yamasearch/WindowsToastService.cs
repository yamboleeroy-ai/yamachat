using System.Diagnostics;
using System.Windows;
using CommunityToolkit.WinUI.Notifications;
using Microsoft.Web.WebView2.Core;

namespace YamaSearch;

/// <summary>
/// Bridges non-persistent WebView notifications to Windows toasts. Web Push is
/// deliberately not simulated: WebView2 exposes only notifications received by
/// a live CoreWebView2 instance.
/// </summary>
internal static class WindowsToastService
{
    private const int MaximumRoutes = 128;
    private static readonly object Sync = new();
    private static readonly Dictionary<string, NotificationRoute> RoutesById = new();
    private static readonly Dictionary<string, string> TaggedRouteIds = new();
    private static readonly Queue<string> RouteOrder = new();
    private static string? _pendingStartupUrl;
    private static bool _registered;

    internal static bool TryInitialize()
    {
        lock (Sync)
        {
            if (_registered) return true;
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
        if (!TryInitialize()) return false;

        var notification = args.Notification;
        var origin = args.SenderOrigin;
        var taggedKey = CreateTaggedKey(origin, notification);
        var routeId = Guid.NewGuid().ToString("N");
        var route = new NotificationRoute(routeId, tab.Id, SafeUrl(tab), notification, taggedKey);

        lock (Sync)
        {
            // Only a Web Notifications API tag is a safe replacement key. Equal
            // text without a tag can represent two separate chat messages.
            if (taggedKey is not null && TaggedRouteIds.ContainsKey(taggedKey))
            {
                args.Handled = true;
                try { notification.ReportClosed(); } catch { }
                return true;
            }

            try
            {
                var title = string.IsNullOrWhiteSpace(notification.Title) ? HostLabel(origin) : notification.Title;
                var body = string.IsNullOrWhiteSpace(notification.Body) ? HostLabel(origin) : notification.Body;
                var builder = new ToastContentBuilder()
                    .AddText(title)
                    .AddText(body)
                    .AddAttributionText(HostLabel(origin))
                    .AddArgument("route", routeId);

                if (TryGetTrustedUrl(route.Url, out var url)) builder.AddArgument("url", url);
                if (!playSound || notification.IsSilent) builder.AddAudio(new ToastAudio { Silent = true });

                var logo = System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "YamaSearch-symbol-256.png");
                if (System.IO.File.Exists(logo)) builder.AddAppLogoOverride(new Uri(logo));

                // WebView requires this before ReportShown/ReportClicked/ReportClosed.
                // It cannot be reverted, therefore an OS toast failure is reported closed.
                args.Handled = true;
                builder.Show();
                notification.ReportShown();
                AddRoute(route);
                notification.CloseRequested += (_, _) => RemoveRoute(routeId);
                return true;
            }
            catch (Exception error)
            {
                try { notification.ReportClosed(); } catch { }
                Debug.WriteLine("Windows notification could not be shown: " + error);
                return false;
            }
        }
    }

    internal static string? TakePendingStartupUrl()
    {
        lock (Sync)
        {
            var url = _pendingStartupUrl;
            _pendingStartupUrl = null;
            return url;
        }
    }

    internal static void Activate(string arguments)
    {
        ToastArguments parsed;
        try { parsed = ToastArguments.Parse(arguments); }
        catch { return; }

        parsed.TryGetValue("route", out var routeId);
        parsed.TryGetValue("url", out var url);
        NotificationRoute? route = null;
        lock (Sync)
        {
            if (!string.IsNullOrWhiteSpace(routeId)) RoutesById.TryGetValue(routeId, out route);
        }

        var targetUrl = TryGetTrustedUrl(url, out var parsedUrl)
            ? parsedUrl
            : TryGetTrustedUrl(route?.Url, out var routeUrl) ? routeUrl : null;
        var app = Application.Current;
        if (app?.Dispatcher is null)
        {
            QueueStartupUrl(targetUrl);
            return;
        }

        app.Dispatcher.BeginInvoke(() => ActivateOnUiThread(app, route, targetUrl));
    }

    private static void ActivateOnUiThread(Application app, NotificationRoute? route, string? targetUrl)
    {
        var windows = app.Windows.OfType<MainWindow>().ToList();
        if (route is not null && windows.FirstOrDefault(window => window.ActivateNotificationTab(route.TabId)) is not null)
        {
            ReportClicked(route);
            return;
        }

        if (targetUrl is not null)
        {
            if (windows.FirstOrDefault(window => window.ActivateExistingNotificationUrl(targetUrl)) is not null)
            {
                ReportClicked(route);
                return;
            }
            if (windows.FirstOrDefault() is { } existingWindow)
            {
                existingWindow.OpenNotificationUrl(targetUrl);
                ReportClicked(route);
                return;
            }
        }

        QueueStartupUrl(targetUrl);
    }

    private static void ReportClicked(NotificationRoute? route)
    {
        if (route is null) return;
        try { route.Notification.ReportClicked(); }
        catch (Exception error) { Debug.WriteLine("Web notification click could not be reported: " + error); }
        finally { RemoveRoute(route.RouteId); }
    }

    private static void QueueStartupUrl(string? targetUrl)
    {
        if (targetUrl is null) return;
        lock (Sync) _pendingStartupUrl = targetUrl;
    }

    private static void AddRoute(NotificationRoute route)
    {
        RoutesById[route.RouteId] = route;
        RouteOrder.Enqueue(route.RouteId);
        if (route.TaggedKey is not null) TaggedRouteIds[route.TaggedKey] = route.RouteId;
        while (RouteOrder.Count > MaximumRoutes) RemoveRoute(RouteOrder.Dequeue());
    }

    private static void RemoveRoute(string routeId)
    {
        lock (Sync)
        {
            if (!RoutesById.Remove(routeId, out var route)) return;
            if (route.TaggedKey is not null && TaggedRouteIds.TryGetValue(route.TaggedKey, out var currentRouteId) && currentRouteId == routeId)
                TaggedRouteIds.Remove(route.TaggedKey);
        }
    }

    private static string? CreateTaggedKey(string origin, CoreWebView2Notification notification)
        => string.IsNullOrWhiteSpace(notification.Tag) ? null : $"{origin}|{notification.Tag}";

    private static string SafeUrl(BrowserTab tab) => tab.View.CoreWebView2?.Source ?? "";

    private static bool TryGetTrustedUrl(string? candidate, out string? trustedUrl)
    {
        trustedUrl = null;
        if (!Uri.TryCreate(candidate, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp)) return false;
        trustedUrl = uri.AbsoluteUri;
        return true;
    }

    private static string HostLabel(string origin)
        => Uri.TryCreate(origin, UriKind.Absolute, out var uri) ? uri.Host : string.IsNullOrWhiteSpace(origin) ? "YamaSearch" : origin;

    private sealed record NotificationRoute(string RouteId, Guid TabId, string Url, CoreWebView2Notification Notification, string? TaggedKey);
}
