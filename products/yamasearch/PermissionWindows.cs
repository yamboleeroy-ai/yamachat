using Microsoft.Web.WebView2.Core;
using System.Windows;
using System.Windows.Controls;
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
        CoreWebView2PermissionKind.PersistentStorage => "trvalé úložiště",
        _ => kind.ToString()
    };

    public static string ToOrigin(string? raw)
        => Uri.TryCreate(raw, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
            ? uri.GetLeftPart(UriPartial.Authority)
            : "Tato stránka";
}

/// <summary>Small, anchored site panel backed directly by the active WebView2 profile.</summary>
internal sealed class SiteInformationPanel
{
    private readonly StackPanel _content;
    private readonly CoreWebView2 _core;
    private readonly string _origin;
    private readonly bool _isPrivate;
    private readonly bool _blockNewNotificationRequests;
    private readonly bool _protectionEnabled;
    private readonly int _blockedCount;
    private readonly Func<bool, Task> _setProtection;
    private readonly Action _openSettings;

    private static readonly CoreWebView2PermissionKind[] SupportedPermissions =
    [
        CoreWebView2PermissionKind.Notifications, CoreWebView2PermissionKind.Camera,
        CoreWebView2PermissionKind.Microphone, CoreWebView2PermissionKind.Geolocation,
        CoreWebView2PermissionKind.ClipboardRead, CoreWebView2PermissionKind.MultipleAutomaticDownloads,
        CoreWebView2PermissionKind.Autoplay, CoreWebView2PermissionKind.FileReadWrite,
        CoreWebView2PermissionKind.OtherSensors, CoreWebView2PermissionKind.LocalFonts,
        CoreWebView2PermissionKind.PersistentStorage
    ];

    public SiteInformationPanel(StackPanel content, CoreWebView2 core, string origin, bool isPrivate, bool blockNewNotificationRequests,
        bool protectionEnabled, int blockedCount, Func<bool, Task> setProtection, Action openSettings)
    {
        _content = content; _core = core; _origin = origin; _isPrivate = isPrivate;
        _blockNewNotificationRequests = blockNewNotificationRequests;
        _protectionEnabled = protectionEnabled; _blockedCount = blockedCount;
        _setProtection = setProtection; _openSettings = openSettings;
    }

    public async Task RenderAsync()
    {
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

        Section("Oprávnění pro tento web");
        _content.Children.Add(Text(_isPrivate ? "Anonymní relace: změny se po zavření okna neukládají." : "Změny se ukládají do profilu WebView2 pro tento přesný původ.", 12, "#9BB5D2"));
        IReadOnlyList<CoreWebView2PermissionSetting> saved;
        try { saved = await _core.Profile.GetNonDefaultPermissionSettingsAsync(); }
        catch (Exception error) { _content.Children.Add(Text("Oprávnění se nepodařilo načíst: " + error.Message, 12, "#FFB7C5")); saved = []; }
        foreach (var kind in SupportedPermissions)
        {
            var setting = saved.FirstOrDefault(x => x.PermissionKind == kind && string.Equals(x.PermissionOrigin, _origin, StringComparison.OrdinalIgnoreCase));
            AddPermissionRow(kind, setting?.PermissionState ?? CoreWebView2PermissionState.Default,
                kind == CoreWebView2PermissionKind.Notifications && setting is null && _blockNewNotificationRequests);
        }
        _content.Children.Add(Text("Web Push na pozadí WebView2 nepodporuje. Běžná webová oznámení fungují jen pro otevřenou kartu během běhu YamaSearch; po zavření karty se nevytváří skrytý proces.", 12, "#9BB5D2"));

        Section("Soubory cookie a data");
        try
        {
            var cookies = await _core.CookieManager.GetCookiesAsync(_origin);
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

        var settings = Button("Nastavení webu", "#182A43");
        settings.Click += (_, _) => _openSettings();
        _content.Children.Add(settings);
    }

    private void AddPermissionRow(CoreWebView2PermissionKind kind, CoreWebView2PermissionState state, bool blockedByGlobalRule)
    {
        var row = new Grid { Margin = new Thickness(0, 7, 0, 0) };
        row.ColumnDefinitions.Add(new ColumnDefinition()); row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var stateText = Text(PermissionLabels.For(kind) + " · " + (blockedByGlobalRule ? "Blokováno globálním pravidlem" : StateLabel(state)), 12, "#DDEAFF");
        row.Children.Add(stateText);
        var choice = new ComboBox { SelectedValue = state, ToolTip = "Změní skutečné oprávnění WebView2", Style = _content.TryFindResource("SitePermissionComboBox") as Style };
        choice.Items.Add(new ComboBoxItem { Content = blockedByGlobalRule ? "Zeptat (globální blok)" : "Zeptat", Tag = CoreWebView2PermissionState.Default });
        choice.Items.Add(new ComboBoxItem { Content = "Povolit", Tag = CoreWebView2PermissionState.Allow });
        choice.Items.Add(new ComboBoxItem { Content = "Blokovat", Tag = CoreWebView2PermissionState.Deny });
        choice.SelectedIndex = state switch { CoreWebView2PermissionState.Allow => 1, CoreWebView2PermissionState.Deny => 2, _ => 0 };
        choice.SelectionChanged += async (_, _) =>
        {
            if (choice.SelectedItem is not ComboBoxItem item || item.Tag is not CoreWebView2PermissionState target) return;
            choice.IsEnabled = false;
            try
            {
                await _core.Profile.SetPermissionStateAsync(kind, _origin, target);
                // Read the profile back instead of trusting the control value. This is
                // the same persisted store used after a card/window is reopened.
                var verified = (await _core.Profile.GetNonDefaultPermissionSettingsAsync())
                    .FirstOrDefault(x => x.PermissionKind == kind && string.Equals(x.PermissionOrigin, _origin, StringComparison.OrdinalIgnoreCase))
                    ?.PermissionState ?? CoreWebView2PermissionState.Default;
                var nowBlockedByGlobalRule = kind == CoreWebView2PermissionKind.Notifications && verified == CoreWebView2PermissionState.Default && _blockNewNotificationRequests;
                stateText.Text = PermissionLabels.For(kind) + " · " + (nowBlockedByGlobalRule ? "Blokováno globálním pravidlem" : StateLabel(verified));
                choice.SelectedIndex = verified switch { CoreWebView2PermissionState.Allow => 1, CoreWebView2PermissionState.Deny => 2, _ => 0 };
                choice.IsEnabled = true;
            }
            catch (Exception error) { choice.IsEnabled = true; MessageBox.Show("Oprávnění se nepodařilo změnit.\n\n" + error.Message, "YamaSearch", MessageBoxButton.OK, MessageBoxImage.Warning); }
        };
        Grid.SetColumn(choice, 1); row.Children.Add(choice); _content.Children.Add(row);
    }

    private void Section(string value) => _content.Children.Add(Text(value, 14, "#7DE7FF", true, new Thickness(0, 18, 0, 6)));
    private static TextBlock Text(string value, double size, string color, bool bold = false, Thickness? margin = null) => new() { Text = value, FontSize = size, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(color)), FontWeight = bold ? FontWeights.SemiBold : FontWeights.Normal, TextWrapping = TextWrapping.Wrap, Margin = margin ?? new Thickness(0, 4, 0, 0) };
    private static Button Button(string value, string background) => new() { Content = value, Height = 32, HorizontalContentAlignment = HorizontalAlignment.Left, Padding = new Thickness(10, 0, 10, 0), Margin = new Thickness(0, 8, 0, 0), Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(background)), Foreground = Brushes.White, BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#315F8B")), BorderThickness = new Thickness(1) };
    private static string StateLabel(CoreWebView2PermissionState value) => value switch { CoreWebView2PermissionState.Allow => "Povoleno", CoreWebView2PermissionState.Deny => "Blokováno", _ => "Zeptat se" };
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
    private readonly StackPanel _list = new();
    private readonly TextBox _search = new() { Height = 34, Margin = new Thickness(0, 12, 0, 0), ToolTip = "Vyhledat web" };

    public PermissionsWindow(CoreWebView2Profile profile, string origin, bool isPrivate)
    {
        _profile = profile; _origin = origin;
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
        header.Children.Add(new TextBlock { Text = isPrivate ? "Anonymní relace — změny se po zavření okna neukládají." : $"Aktuální stránka: {_origin}", Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#9BB5D2")), Margin = new Thickness(0, 5, 0, 0), TextWrapping = TextWrapping.Wrap });
        if (string.IsNullOrWhiteSpace(_origin))
        {
            _search.TextChanged += async (_, _) => await LoadAsync();
            header.Children.Add(_search);
        }
        DockPanel.SetDock(header, Dock.Top); panel.Children.Add(header);
        var scroll = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = _list };
        panel.Children.Add(scroll);
        Grid.SetRow(panel, 1); root.Children.Add(panel);
        Content = new Border { BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#245A84")), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(12), Child = root };
        Loaded += async (_, _) => await LoadAsync();
    }

    private async Task LoadAsync()
    {
        _list.Children.Clear();
        var settings = await _profile.GetNonDefaultPermissionSettingsAsync();
        var query = _search.Text.Trim();
        var visible = settings.Where(x => (string.IsNullOrWhiteSpace(_origin) || _origin == "Tato stránka" || string.Equals(x.PermissionOrigin, _origin, StringComparison.OrdinalIgnoreCase))
            && (string.IsNullOrWhiteSpace(query) || x.PermissionOrigin.Contains(query, StringComparison.OrdinalIgnoreCase))).ToList();
        if (visible.Count == 0)
        {
            _list.Children.Add(new TextBlock { Text = "Pro tuto stránku zatím není uložené žádné rozhodnutí. Při další žádosti se zobrazí dialog.", Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#9BB5D2")), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(4) });
            return;
        }
        foreach (var setting in visible)
        {
            var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 4, 0, 4) };
            row.Children.Add(new TextBlock { Text = $"{setting.PermissionOrigin} · {PermissionLabels.For(setting.PermissionKind)} — {setting.PermissionState}", Width = 310, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis, ToolTip = setting.PermissionOrigin });
            var allow = new Button { Content = "Povolit", MinWidth = 74, Height = 34, Margin = new Thickness(4, 0, 0, 0) };
            allow.Click += async (_, _) => { await _profile.SetPermissionStateAsync(setting.PermissionKind, setting.PermissionOrigin, CoreWebView2PermissionState.Allow); await LoadAsync(); };
            row.Children.Add(allow);
            var deny = new Button { Content = "Blokovat", MinWidth = 78, Height = 34, Margin = new Thickness(4, 0, 0, 0) };
            deny.Click += async (_, _) => { await _profile.SetPermissionStateAsync(setting.PermissionKind, setting.PermissionOrigin, CoreWebView2PermissionState.Deny); await LoadAsync(); };
            row.Children.Add(deny);
            var reset = new Button { Content = "Zeptat", MinWidth = 65, Height = 34, Margin = new Thickness(4, 0, 0, 0) };
            reset.Click += async (_, _) => { await _profile.SetPermissionStateAsync(setting.PermissionKind, setting.PermissionOrigin, CoreWebView2PermissionState.Default); await LoadAsync(); };
            row.Children.Add(reset); _list.Children.Add(row);
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
