using Microsoft.Web.WebView2.Core;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Shell;

namespace YamaSearch;

internal static class PermissionLabels
{
    public static string For(CoreWebView2PermissionKind kind) => kind switch
    {
        CoreWebView2PermissionKind.Notifications => "oznámení",
        CoreWebView2PermissionKind.Camera => "kameru",
        CoreWebView2PermissionKind.Microphone => "mikrofon",
        CoreWebView2PermissionKind.Geolocation => "polohu",
        CoreWebView2PermissionKind.ClipboardRead => "schránku",
        CoreWebView2PermissionKind.MultipleAutomaticDownloads => "automatická stahování",
        CoreWebView2PermissionKind.Autoplay => "automatické přehrávání",
        CoreWebView2PermissionKind.FileReadWrite => "soubory",
        CoreWebView2PermissionKind.OtherSensors => "senzory",
        CoreWebView2PermissionKind.LocalFonts => "místní písma",
        CoreWebView2PermissionKind.MidiSystemExclusiveMessages => "MIDI zařízení",
        CoreWebView2PermissionKind.WindowManagement => "správu oken",
        CoreWebView2PermissionKind.PersistentStorage => "trvalé úložiště",
        _ => kind.ToString()
    };

    public static bool TryGetOrigin(string? raw, out string origin)
    {
        if (Uri.TryCreate(raw, UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
            && !string.IsNullOrWhiteSpace(uri.Host))
        {
            origin = uri.GetLeftPart(UriPartial.Authority);
            return true;
        }

        origin = string.Empty;
        return false;
    }

    public static string ToOrigin(string? raw)
        => TryGetOrigin(raw, out var origin) ? origin : "Tato stránka";

    public static string NormalizeOrigin(string? raw)
        => TryGetOrigin(raw, out var origin) ? origin : raw?.Trim() ?? string.Empty;

    public static bool SameOrigin(string? first, string? second)
        => TryGetOrigin(first, out var normalizedFirst)
            && TryGetOrigin(second, out var normalizedSecond)
            && string.Equals(normalizedFirst, normalizedSecond, StringComparison.OrdinalIgnoreCase);
}

/// <summary>
/// Serializes profile mutations for one exact origin across every browser window.
/// Entries are reference-counted and removed after the last queued operation, so
/// browsing many sites does not leave a permanent in-memory gate for each one.
/// </summary>
internal static class PermissionMutationCoordinator
{
    private sealed class GateEntry
    {
        public SemaphoreSlim Gate { get; } = new(1, 1);
        public int Users { get; set; }
    }

    private static readonly object Sync = new();
    private static readonly Dictionary<string, GateEntry> Gates = new(StringComparer.OrdinalIgnoreCase);

    public static async Task RunAsync(CoreWebView2Profile profile, string origin, Func<Task> operation)
    {
        await RunAsync<object?>(profile, origin, async () => { await operation(); return null; });
    }

    public static async Task<T> RunAsync<T>(CoreWebView2Profile profile, string origin, Func<Task<T>> operation)
    {
        var key = profile.ProfilePath + "\u001f" + PermissionLabels.NormalizeOrigin(origin);
        GateEntry entry;
        lock (Sync)
        {
            if (!Gates.TryGetValue(key, out entry!))
            {
                entry = new GateEntry();
                Gates[key] = entry;
            }
            entry.Users++;
        }

        try
        {
            await entry.Gate.WaitAsync();
            try { return await operation(); }
            finally { entry.Gate.Release(); }
        }
        finally
        {
            lock (Sync)
            {
                entry.Users--;
                if (entry.Users == 0) Gates.Remove(key);
            }
        }
    }
}

/// <summary>
/// Coalesces the same live permission request across browser windows that share a
/// WebView2 profile. Only the leader displays a prompt; every still-current
/// participant applies and may idempotently persist the same shared answer.
/// </summary>
internal static class PermissionRequestCoordinator
{
    internal sealed class Entry
    {
        public TaskCompletionSource<CoreWebView2PermissionState> Decision { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public int Users { get; set; }
    }

    internal sealed class Lease : IDisposable
    {
        private readonly string _key;
        private readonly Entry _entry;
        private int _disposed;

        internal Lease(string key, Entry entry, bool isLeader)
        {
            _key = key;
            _entry = entry;
            IsLeader = isLeader;
        }

        public bool IsLeader { get; }
        public Task<CoreWebView2PermissionState> Decision => _entry.Decision.Task;

        public void Complete(CoreWebView2PermissionState state)
        {
            if (IsLeader) _entry.Decision.TrySetResult(state);
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
            if (IsLeader) _entry.Decision.TrySetResult(CoreWebView2PermissionState.Default);
            lock (Sync)
            {
                _entry.Users--;
                if (_entry.Users == 0 && Entries.TryGetValue(_key, out var current) && ReferenceEquals(current, _entry))
                    Entries.Remove(_key);
            }
        }
    }

    private static readonly object Sync = new();
    private static readonly Dictionary<string, Entry> Entries = new(StringComparer.OrdinalIgnoreCase);

    public static Lease Join(CoreWebView2Profile profile, string origin, CoreWebView2PermissionKind kind)
    {
        var key = profile.ProfilePath + "\u001f" + PermissionLabels.NormalizeOrigin(origin) + "\u001f" + kind;
        lock (Sync)
        {
            var isLeader = !Entries.TryGetValue(key, out var entry);
            if (isLeader)
            {
                entry = new Entry();
                Entries[key] = entry;
            }
            entry!.Users++;
            return new Lease(key, entry, isLeader);
        }
    }
}

/// <summary>Small, anchored site panel backed directly by the active WebView2 profile.</summary>
internal sealed class SiteInformationPanel
{
    private readonly StackPanel _content;
    private readonly CoreWebView2 _core;
    private readonly string _origin;
    private readonly bool _isPrivate;
    private readonly bool _protectionEnabled;
    private readonly int _blockedCount;
    private readonly Func<bool, Task> _setProtection;
    private readonly Action _openSettings;
    private readonly IReadOnlyList<SitePermissionActivity> _activities;
    private readonly Action _refreshPermissionIndicator;
    private readonly Func<bool>? _isCurrent;

    public SiteInformationPanel(StackPanel content, CoreWebView2 core, string origin, bool isPrivate,
        bool protectionEnabled, int blockedCount, Func<bool, Task> setProtection, Action openSettings,
        IReadOnlyList<SitePermissionActivity> activities, Action refreshPermissionIndicator, Func<bool>? isCurrent = null)
    {
        _content = content; _core = core; _origin = origin; _isPrivate = isPrivate;
        _protectionEnabled = protectionEnabled; _blockedCount = blockedCount;
        _setProtection = setProtection; _openSettings = openSettings;
        _activities = activities.ToArray();
        _refreshPermissionIndicator = refreshPermissionIndicator;
        _isCurrent = isCurrent;
    }

    public async Task RenderAsync()
    {
        if (!IsCurrent()) return;
        _content.Children.Clear();
        if (!Uri.TryCreate(_origin, UriKind.Absolute, out var page) || page.Scheme is not ("http" or "https"))
        {
            _content.Children.Add(Text("Informace o stránce", 18, "#7DE7FF", true));
            _content.Children.Add(Text("Pro novou kartu a interní stránky nejsou webová oprávnění ani data k dispozici.", 13, "#A9BDD5"));
            return;
        }

        _content.Children.Add(Text(page.Host, 18, "#EAF3FF", true));
        var secure = page.Scheme == Uri.UriSchemeHttps;
        _content.Children.Add(Text(secure ? "🔒 Zabezpečené připojení HTTPS" : "⚠ Nezabezpečené připojení HTTP", 13, secure ? "#75E6B2" : "#FFC36B", true));
        _content.Children.Add(Text(secure
            ? "Certifikát a šifrování ověřuje WebView2/Windows. Podrobné údaje certifikátu WebView2 tomuto hostiteli neposkytuje."
            : "Údaje odeslané na této stránce nejsou šifrované.", 12, "#A9BDD5"));

        // Edge-like site information must describe only permissions that this tab
        // actually requested or that the relevant WebView2 profile already stores.
        // Showing every possible permission made the previous panel both misleading
        // and hard to use.
        var activities = _activities
            .Where(activity => PermissionLabels.TryGetOrigin(activity.Origin, out _))
            .OrderByDescending(activity => activity.UpdatedAt)
            .ToList();
        var relatedOrigins = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (PermissionLabels.TryGetOrigin(_origin, out var topLevelOrigin)) relatedOrigins.Add(topLevelOrigin);
        foreach (var activity in activities) relatedOrigins.Add(PermissionLabels.NormalizeOrigin(activity.Origin));

        IReadOnlyList<CoreWebView2PermissionSetting> saved;
        try { saved = await _core.Profile.GetNonDefaultPermissionSettingsAsync(); }
        catch (Exception error) { _content.Children.Add(Text("Oprávnění se nepodařilo načíst: " + error.Message, 12, "#FFB7C5")); saved = []; }
        if (!IsCurrent()) return;

        var savedForPage = saved
            .Where(setting => relatedOrigins.Contains(PermissionLabels.NormalizeOrigin(setting.PermissionOrigin)))
            .OrderBy(setting => setting.PermissionOrigin, StringComparer.OrdinalIgnoreCase)
            .ThenBy(setting => setting.PermissionKind.ToString(), StringComparer.Ordinal)
            .ToList();
        var storedWithoutObservedActivity = savedForPage
            .Where(setting => !activities.Any(activity => activity.Kind == setting.PermissionKind
                && PermissionLabels.SameOrigin(activity.Origin, setting.PermissionOrigin)))
            .ToList();

        Section("Oprávnění webu");
        _content.Children.Add(Text(_isPrivate
            ? "Anonymní relace: rozhodnutí z výzvy platí jen pro tuto relaci."
            : "Zobrazené volby patří přesnému webu, který o oprávnění skutečně požádal.", 12, "#9BB5D2"));
        if (activities.Count == 0 && savedForPage.Count == 0)
        {
            _content.Children.Add(Text("Tato karta zatím nepožádala o žádné oprávnění. Požadavek mikrofonu nebo kamery se objeví až ve chvíli, kdy jej stránka skutečně vyžádá, například při připojení k hovoru.", 12, "#A9BDD5"));
        }
        else
        {
            foreach (var activity in activities) AddObservedPermissionRow(activity);
            foreach (var setting in storedWithoutObservedActivity) AddStoredPermissionRow(setting);
            if (activities.Any(activity => activity.Kind is CoreWebView2PermissionKind.Camera or CoreWebView2PermissionKind.Microphone))
                _content.Children.Add(Text("Aktivní použití mikrofonu a kamery se zobrazuje podle živého mediálního streamu této karty.", 11, "#8FAEC9"));
            if (activities.Any(activity => activity.IsMediaInUse))
                _content.Children.Add(Text("Změna oprávnění neukončí už běžící hovor. Pro okamžité zastavení se odpojte od hovoru nebo obnovte stránku; nové pravidlo se použije při další žádosti.", 11, "#FCD34D"));
        }

        if (savedForPage.Count > 0)
        {
            var resetPermissions = Button("Obnovit uložená oprávnění", "#3A202B");
            resetPermissions.ToolTip = "Odstraní uložená rozhodnutí pro weby, které tato karta skutečně použila";
            resetPermissions.Click += async (_, _) =>
            {
                resetPermissions.IsEnabled = false;
                try
                {
                    foreach (var group in savedForPage.GroupBy(setting => setting.PermissionOrigin, StringComparer.OrdinalIgnoreCase))
                    {
                        await PermissionMutationCoordinator.RunAsync(_core.Profile, group.Key, async () =>
                        {
                            foreach (var setting in group)
                                await _core.Profile.SetPermissionStateAsync(setting.PermissionKind, setting.PermissionOrigin, CoreWebView2PermissionState.Default);
                        });
                    }
                    foreach (var setting in savedForPage)
                    {
                        foreach (var activity in _activities.Where(activity => activity.Kind == setting.PermissionKind
                            && PermissionLabels.SameOrigin(activity.Origin, setting.PermissionOrigin)))
                        {
                            activity.State = CoreWebView2PermissionState.Default;
                            activity.IsPending = false;
                            activity.IsSessionOnly = false;
                            activity.BlockedByGlobalRule = false;
                            activity.LastError = null;
                            activity.MediaErrorName = null;
                            activity.UpdatedAt = DateTimeOffset.Now;
                        }
                    }
                    _refreshPermissionIndicator();
                    await RenderAsync();
                }
                catch (Exception error)
                {
                    resetPermissions.IsEnabled = true;
                    MessageBox.Show("Oprávnění se nepodařilo obnovit.\n\n" + error.Message, "YamaSearch", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            };
            _content.Children.Add(resetPermissions);
        }
        var settings = Button("Spravovat oprávnění tohoto webu", "#182A43");
        settings.Click += (_, _) => _openSettings();
        _content.Children.Add(settings);
        _content.Children.Add(Text("Web Push na pozadí WebView2 nepodporuje. Běžná webová oznámení fungují jen pro otevřenou kartu během běhu YamaSearch; po zavření karty se nevytváří skrytý proces.", 12, "#9BB5D2"));

        Section("Soubory cookie a data");
        try
        {
            var cookies = await _core.CookieManager.GetCookiesAsync(_origin);
            if (!IsCurrent()) return;
            _content.Children.Add(Text($"Uložené cookies pro tento web: {cookies.Count}. Odstranění může způsobit odhlášení.", 12, "#A9BDD5"));
            var clear = Button("Odstranit cookies tohoto webu", "#3A202B");
            clear.Click += (_, _) => { foreach (var cookie in cookies) _core.CookieManager.DeleteCookie(cookie); _ = RenderAsync(); };
            _content.Children.Add(clear);
            var clearStorage = Button("Odstranit data této otevřené stránky", "#3A202B");
            clearStorage.Click += async (_, _) =>
            {
                clearStorage.IsEnabled = false;
                try
                {
                    await _core.ExecuteScriptAsync("(async()=>{localStorage.clear();sessionStorage.clear();if('caches' in window){for(const key of await caches.keys())await caches.delete(key);}if(indexedDB.databases){for(const db of await indexedDB.databases())if(db.name)indexedDB.deleteDatabase(db.name);}return true;})()");
                    await RenderAsync();
                }
                catch (Exception error) { clearStorage.IsEnabled = true; MessageBox.Show("Data stránky se nepodařilo odstranit.\n\n" + error.Message, "YamaSearch", MessageBoxButton.OK, MessageBoxImage.Warning); }
            };
            _content.Children.Add(clearStorage);
            _content.Children.Add(Text("Odstraní dostupné úložiště aktuálního původu (local/session storage, cache a IndexedDB). Může vás odhlásit.", 12, "#9BB5D2"));
        }
        catch (Exception error) { _content.Children.Add(Text("Cookies se nepodařilo načíst: " + error.Message, 12, "#FFB7C5")); }

        Section("Ochrana před sledováním");
        _content.Children.Add(Text(_protectionEnabled ? $"YamaBlock je zapnutý · na této kartě skutečně zablokoval {_blockedCount} požadavků." : "YamaBlock je pro tento web vypnutý.", 12, _protectionEnabled ? "#FCD34D" : "#A9BDD5"));
        var protection = Button(_protectionEnabled ? "Vypnout ochranu pro tento web" : "Zapnout ochranu pro tento web", "#172D45");
        protection.Click += async (_, _) => { protection.IsEnabled = false; await _setProtection(!_protectionEnabled); };
        _content.Children.Add(protection);

    }

    private void AddObservedPermissionRow(SitePermissionActivity activity)
    {
        var state = activity.IsMediaInUse
            ? activity.State == CoreWebView2PermissionState.Allow
                ? "Povoleno · právě se používá"
                : "Právě se používá"
            : activity.IsMediaRequestPending
                ? "Web právě žádá o přístup"
            : !string.IsNullOrWhiteSpace(activity.LastError)
            ? "Žádost se nepodařilo zpracovat"
            : !string.IsNullOrWhiteSpace(activity.MediaErrorName)
                && activity.State != CoreWebView2PermissionState.Deny
                ? "Zařízení se nepodařilo spustit"
            : activity.IsPending
                ? "Čeká na vaše rozhodnutí"
                : activity.BlockedByGlobalRule
                    ? "Blokováno globálním pravidlem"
                    : activity.State switch
                    {
                        CoreWebView2PermissionState.Allow when activity.IsSessionOnly => "Povoleno jen pro tuto anonymní relaci",
                        CoreWebView2PermissionState.Allow => "Povoleno",
                        CoreWebView2PermissionState.Deny => "Blokováno",
                        _ when activity.WasMediaUsed => "Použití skončilo; bez uloženého rozhodnutí",
                        _ => "Web požádal; bez uloženého rozhodnutí"
                    };
        var color = activity.IsMediaInUse ? "#7DE7FF"
            : !string.IsNullOrWhiteSpace(activity.LastError) || (!string.IsNullOrWhiteSpace(activity.MediaErrorName)
                && activity.State != CoreWebView2PermissionState.Deny) ? "#FFB7C5"
            : activity.IsPending || activity.IsMediaRequestPending ? "#7DE7FF"
            : activity.State == CoreWebView2PermissionState.Allow ? "#75E6B2"
            : activity.State == CoreWebView2PermissionState.Deny ? "#FFB7C5"
            : "#C8D9ED";
        var host = PermissionLabels.TryGetOrigin(_origin, out var topLevel)
            && PermissionLabels.SameOrigin(topLevel, activity.Origin)
            ? null
            : activity.Origin;
        var row = new StackPanel { Margin = new Thickness(0, 7, 0, 0) };
        row.Children.Add(Text(PermissionLabels.For(activity.Kind) + " · " + state, 12, color, true));
        if (!string.IsNullOrWhiteSpace(activity.LastError)) row.Children.Add(Text(activity.LastError, 11, "#FFB7C5"));
        else if (!string.IsNullOrWhiteSpace(activity.MediaErrorName) && activity.State != CoreWebView2PermissionState.Deny)
            row.Children.Add(Text(MediaErrorDescription(activity.MediaErrorName), 11, "#FFB7C5"));
        if (host is not null) row.Children.Add(Text("žádá: " + host, 11, "#8FAEC9"));
        _content.Children.Add(row);
    }

    private void AddStoredPermissionRow(CoreWebView2PermissionSetting setting)
    {
        var state = setting.PermissionState == CoreWebView2PermissionState.Allow ? "Povoleno" : "Blokováno";
        var color = setting.PermissionState == CoreWebView2PermissionState.Allow ? "#75E6B2" : "#FFB7C5";
        var row = new StackPanel { Margin = new Thickness(0, 7, 0, 0) };
        row.Children.Add(Text(PermissionLabels.For(setting.PermissionKind) + " · " + state, 12, color, true));
        if (!PermissionLabels.SameOrigin(setting.PermissionOrigin, _origin))
            row.Children.Add(Text("web: " + setting.PermissionOrigin, 11, "#8FAEC9"));
        _content.Children.Add(row);
    }

    private void Section(string value) => _content.Children.Add(Text(value, 14, "#7DE7FF", true, new Thickness(0, 18, 0, 6)));
    private static string MediaErrorDescription(string errorName) => errorName switch
    {
        "NotAllowedError" => "Přístup odmítl webový profil nebo systém Windows.",
        "NotFoundError" => "Požadované zařízení nebylo nalezeno.",
        "NotReadableError" => "Zařízení právě používá jiná aplikace nebo jej Windows nemůže otevřít.",
        _ => "Webový mediální stream se nepodařilo spustit."
    };
    private bool IsCurrent() => _isCurrent?.Invoke() ?? true;
    private static TextBlock Text(string value, double size, string color, bool bold = false, Thickness? margin = null) => new() { Text = value, FontSize = size, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(color)), FontWeight = bold ? FontWeights.SemiBold : FontWeights.Normal, TextWrapping = TextWrapping.Wrap, Margin = margin ?? new Thickness(0, 4, 0, 0) };
    private static Button Button(string value, string background) => new() { Content = value, Height = 32, HorizontalContentAlignment = HorizontalAlignment.Left, Padding = new Thickness(10, 0, 10, 0), Margin = new Thickness(0, 8, 0, 0), Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(background)), Foreground = Brushes.White, BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#315F8B")), BorderThickness = new Thickness(1) };
}

public sealed class PermissionPromptWindow : Window
{
    public PermissionPromptWindow(string origin, string permission)
    {
        Title = "YamaSearch – oprávnění webu";
        Width = 450; Height = 320; ResizeMode = ResizeMode.NoResize; WindowStyle = WindowStyle.None;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#08111D"));
        Foreground = Brushes.White;
        WindowChrome.SetWindowChrome(this, new WindowChrome { CaptionHeight = 0, ResizeBorderThickness = new Thickness(5), CornerRadius = new CornerRadius(0), GlassFrameThickness = new Thickness(0), UseAeroCaptionButtons = false });

        var root = new Grid();
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(42) });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.Children.Add(PermissionWindowChrome.CreateYamaTitleBar(this));
        var panel = new StackPanel { Margin = new Thickness(24, 18, 24, 20) };
        panel.Children.Add(new TextBlock { Text = "Oprávnění webu", FontSize = 21, FontWeight = FontWeights.SemiBold, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#42D8FF")) });
        panel.Children.Add(new TextBlock { Text = origin, FontSize = 15, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 20, 0, 5), TextWrapping = TextWrapping.Wrap });
        panel.Children.Add(new TextBlock { Text = $"chce používat {permission}.", Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#B7CAE4")), TextWrapping = TextWrapping.Wrap });
        panel.Children.Add(new TextBlock { Text = "Rozhodnutí se uloží jen pro tento přesný původ stránky. V anonymním okně se po zavření neuloží.", FontSize = 12, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#7F9CBC")), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 10, 0, 18) });

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        var deny = CreateButton("Blokovat", "#34202B");
        deny.Click += (_, _) => DialogResult = false;
        var allow = CreateButton("Povolit", "#12648A");
        allow.Margin = new Thickness(10, 0, 0, 0);
        allow.Click += (_, _) => DialogResult = true;
        buttons.Children.Add(deny); buttons.Children.Add(allow);
        panel.Children.Add(buttons);
        Grid.SetRow(panel, 1); root.Children.Add(panel);
        Content = new Border { BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#245A84")), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(12), Child = root };
    }

    private static Button CreateButton(string text, string background) => new()
    {
        Content = text, MinWidth = 110, Height = 38, Padding = new Thickness(14, 0, 14, 0),
        Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(background)),
        Foreground = Brushes.White, BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3B80B8")), BorderThickness = new Thickness(1)
    };
}

public sealed class PermissionsWindow : Window
{
    private readonly CoreWebView2Profile _profile;
    private readonly string _origin;
    private readonly HashSet<string> _relatedOrigins = new(StringComparer.OrdinalIgnoreCase);
    private readonly Action<CoreWebView2PermissionSetting, CoreWebView2PermissionState>? _permissionUpdated;
    private readonly StackPanel _list = new();
    private readonly TextBox _search = new() { Height = 34, Margin = new Thickness(0, 12, 0, 0), ToolTip = "Vyhledat web" };
    private int _loadVersion;

    public PermissionsWindow(CoreWebView2Profile profile, string origin, bool isPrivate, IEnumerable<string>? relatedOrigins = null,
        Action<CoreWebView2PermissionSetting, CoreWebView2PermissionState>? permissionUpdated = null)
    {
        _profile = profile; _origin = origin;
        _permissionUpdated = permissionUpdated;
        if (relatedOrigins is not null)
        {
            foreach (var relatedOrigin in relatedOrigins)
                if (PermissionLabels.TryGetOrigin(relatedOrigin, out var normalized)) _relatedOrigins.Add(normalized);
        }
        if (PermissionLabels.TryGetOrigin(origin, out var currentOrigin)) _relatedOrigins.Add(currentOrigin);
        Title = "YamaSearch – oprávnění webů";
        Width = 650; Height = 620; MinWidth = 520; MinHeight = 420; WindowStyle = WindowStyle.None;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#08111D")); Foreground = Brushes.White;
        WindowChrome.SetWindowChrome(this, new WindowChrome { CaptionHeight = 0, ResizeBorderThickness = new Thickness(6), CornerRadius = new CornerRadius(0), GlassFrameThickness = new Thickness(0), UseAeroCaptionButtons = false });
        var root = new Grid();
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(42) });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.Children.Add(PermissionWindowChrome.CreateYamaTitleBar(this));
        var panel = new DockPanel { Margin = new Thickness(22) };
        var close = new Button { Content = "Zavřít", Height = 38, MinWidth = 105, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 14, 0, 0) };
        close.Click += (_, _) => Close();
        DockPanel.SetDock(close, Dock.Bottom); panel.Children.Add(close);
        var header = new StackPanel { Margin = new Thickness(0, 0, 0, 15) };
        header.Children.Add(new TextBlock { Text = "Oprávnění webů", FontSize = 22, FontWeight = FontWeights.SemiBold, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#42D8FF")) });
        var pageDescription = _relatedOrigins.Count > 1
            ? $"Aktuální stránka a {_relatedOrigins.Count - 1} skutečně použitý vložený web."
            : string.IsNullOrWhiteSpace(_origin) ? "Uložená oprávnění všech webů." : $"Aktuální stránka: {_origin}";
        header.Children.Add(new TextBlock { Text = isPrivate ? "Anonymní relace — změny se po zavření okna neukládají." : pageDescription, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#9BB5D2")), Margin = new Thickness(0, 5, 0, 0), TextWrapping = TextWrapping.Wrap });
        if (string.IsNullOrWhiteSpace(_origin))
        {
            _search.TextChanged += async (_, _) => await LoadAsync();
            header.Children.Add(_search);
        }
        DockPanel.SetDock(header, Dock.Top); panel.Children.Add(header);
        var scroll = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = _list };
        if (Application.Current.TryFindResource("YamaScrollBar") is Style scrollBarStyle)
            scroll.Resources[typeof(ScrollBar)] = scrollBarStyle;
        panel.Children.Add(scroll);
        Grid.SetRow(panel, 1); root.Children.Add(panel);
        Content = new Border { BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#245A84")), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(12), Child = root };
        Loaded += async (_, _) => await LoadAsync();
    }

    private async Task LoadAsync()
    {
        var version = ++_loadVersion;
        try
        {
            var settings = await _profile.GetNonDefaultPermissionSettingsAsync();
            if (!IsLoaded || version != _loadVersion) return;

            _list.Children.Clear();
            var query = _search.Text.Trim();
            var visible = settings.Where(x => (_relatedOrigins.Count == 0 || _relatedOrigins.Contains(PermissionLabels.NormalizeOrigin(x.PermissionOrigin)))
                && (string.IsNullOrWhiteSpace(query) || x.PermissionOrigin.Contains(query, StringComparison.OrdinalIgnoreCase))).ToList();
            if (visible.Count == 0)
            {
                _list.Children.Add(new TextBlock { Text = "Pro tuto stránku zatím není uložené žádné rozhodnutí. Při další žádosti se zobrazí dialog.", Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#9BB5D2")), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(4) });
                return;
            }
            foreach (var setting in visible)
            {
                var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 4, 0, 4) };
                var stateLabel = setting.PermissionState == CoreWebView2PermissionState.Allow ? "Povoleno" : "Blokováno";
                row.Children.Add(new TextBlock { Text = $"{setting.PermissionOrigin} · {PermissionLabels.For(setting.PermissionKind)} — {stateLabel}", Width = 310, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis, ToolTip = setting.PermissionOrigin });
                var allow = new Button { Content = "Povolit", MinWidth = 74, Height = 34, Margin = new Thickness(4, 0, 0, 0) };
                allow.Click += async (_, _) => await UpdatePermissionAsync(setting, CoreWebView2PermissionState.Allow);
                row.Children.Add(allow);
                var deny = new Button { Content = "Blokovat", MinWidth = 78, Height = 34, Margin = new Thickness(4, 0, 0, 0) };
                deny.Click += async (_, _) => await UpdatePermissionAsync(setting, CoreWebView2PermissionState.Deny);
                row.Children.Add(deny);
                var reset = new Button { Content = "Zeptat", MinWidth = 65, Height = 34, Margin = new Thickness(4, 0, 0, 0) };
                reset.Click += async (_, _) => await UpdatePermissionAsync(setting, CoreWebView2PermissionState.Default);
                row.Children.Add(reset); _list.Children.Add(row);
            }
        }
        catch (Exception exception)
        {
            if (!IsLoaded || version != _loadVersion) return;
            _list.Children.Clear();
            _list.Children.Add(new TextBlock
            {
                Text = "Oprávnění se nepodařilo načíst. Webový proces mohl být právě ukončen. Zavřete okno a zkuste to znovu.",
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FFB4A8")),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(4),
                ToolTip = exception.Message
            });
        }
    }

    private async Task UpdatePermissionAsync(CoreWebView2PermissionSetting setting, CoreWebView2PermissionState state)
    {
        try
        {
            await PermissionMutationCoordinator.RunAsync(_profile, setting.PermissionOrigin,
                () => _profile.SetPermissionStateAsync(setting.PermissionKind, setting.PermissionOrigin, state));
            _permissionUpdated?.Invoke(setting, state);
            await LoadAsync();
        }
        catch (Exception exception)
        {
            if (!IsLoaded) return;
            _list.Children.Clear();
            _list.Children.Add(new TextBlock
            {
                Text = "Změnu oprávnění se nepodařilo uložit. Webový proces mohl být právě ukončen.",
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FFB4A8")),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(4),
                ToolTip = exception.Message
            });
        }
    }

}

internal static class PermissionWindowChrome
{
    public static Grid CreateYamaTitleBar(Window window)
    {
        var bar = new Grid { Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#101D30")), Margin = new Thickness(1, 1, 1, 0) };
        bar.ColumnDefinitions.Add(new ColumnDefinition());
        bar.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        bar.Children.Add(new TextBlock { Text = "YamaSearch", Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#7DE7FF")), FontWeight = FontWeights.SemiBold, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(16, 0, 0, 0) });
        var close = new Button { Content = "×", Width = 42, Height = 40, FontSize = 20, Padding = new Thickness(0), Foreground = Brushes.White, Background = Brushes.Transparent, BorderThickness = new Thickness(0), ToolTip = "Zavřít" };
        close.Click += (_, _) => window.Close();
        Grid.SetColumn(close, 1); bar.Children.Add(close);
        bar.MouseLeftButtonDown += (_, e) => { if (e.LeftButton == System.Windows.Input.MouseButtonState.Pressed) window.DragMove(); };
        return bar;
    }
}
