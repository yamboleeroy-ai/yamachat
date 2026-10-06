using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using System.Collections.ObjectModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Diagnostics;
using System.Net.Http;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace YamaSearch;

public partial class MainWindow : Window
{
    private readonly ObservableCollection<BrowserTab> _tabs = [];
    private readonly SettingsStore _settings = new();
    private static readonly HttpClient UpdateClient = new() { Timeout = TimeSpan.FromSeconds(5) };
    private const string UpdateManifestUrl = "https://updates.yamachat.eu/yamasearch/latest.json";
    private BrowserTab? _active;
    private System.Windows.Controls.Primitives.Popup? _tabActionsPopup;
    private bool _suppressSuggestions;
    private readonly string _webDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YamaSearch", "WebView");
    private readonly HashSet<string> _adHosts = new(StringComparer.OrdinalIgnoreCase)
    { "doubleclick.net", "googlesyndication.com", "google-analytics.com", "adservice.google.com", "connect.facebook.net", "scorecardresearch.com" };

    public MainWindow()
    {
        InitializeComponent();
        SourceInitialized += (_, _) => SetDarkWindowBorder();
        ApplyTheme(_settings.Data.Theme);
        UpdateBlockButton();
        KeyDown += MainWindow_KeyDown;
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        if (!_settings.Data.OnboardingCompleted)
        {
            var welcome = new OnboardingWindow(_settings) { Owner = this };
            if (welcome.ShowDialog() != true) { Close(); return; }
            _settings.Save();
        }
        await CreateTabAsync();
        _ = CheckForYamaSearchUpdateAsync();
    }

    private sealed record YamaSearchUpdate(string? Version, string? Notes, string? PortableUrl, string? InstallerUrl);
    private async Task CheckForYamaSearchUpdateAsync()
    {
        try
        {
            var json = await UpdateClient.GetStringAsync(UpdateManifestUrl);
            var update = JsonSerializer.Deserialize<YamaSearchUpdate>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            var current = typeof(MainWindow).Assembly.GetName().Version;
            if (update is null || !Version.TryParse(update.Version, out var available) || current is null || available <= current) return;
            var message = string.IsNullOrWhiteSpace(update.Notes) ? $"Je dostupná nová verze YamaSearch {available}." : update.Notes;
            var choice = MessageBox.Show(message + "\n\nAno: Installer\nNe: Portable ZIP", "Aktualizace YamaSearch", MessageBoxButton.YesNoCancel, MessageBoxImage.Information);
            var target = choice == MessageBoxResult.Yes ? update.InstallerUrl : choice == MessageBoxResult.No ? update.PortableUrl : null;
            if (!string.IsNullOrWhiteSpace(target) && Uri.TryCreate(target, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps && string.Equals(uri.Host, "updates.yamachat.eu", StringComparison.OrdinalIgnoreCase)) Process.Start(new ProcessStartInfo(uri.ToString()) { UseShellExecute = true });
        }
        catch { /* Update availability must never prevent normal browsing. */ }
    }

    private async Task CreateTabAsync(string? address = null)
    {
        var tab = new BrowserTab();
        _tabs.Add(tab);
        SelectTab(tab);
        StatusText.Text = "Spouštím webový engine…";
        try
        {
            var environment = await CreateWebViewEnvironmentAsync();
            var initializeTask = tab.View.EnsureCoreWebView2Async(environment);
            if (await Task.WhenAny(initializeTask, Task.Delay(TimeSpan.FromSeconds(12))) != initializeTask)
                throw new TimeoutException("WebView2 Runtime se nespustil během 12 sekund.");
            await initializeTask;
            ConfigureWebView(tab);
            SelectTab(tab);
            _ = Dispatcher.BeginInvoke(() => TabsScroller.ScrollToRightEnd());
            await NavigateAsync(tab, address ?? _settings.Data.HomePage);
        }
        catch (Exception exception)
        {
            _tabs.Remove(tab);
            tab.View.Dispose();
            StatusText.Text = "WebView2 se nepodařilo spustit: " + exception.Message;
            MessageBox.Show("YamaSearch potřebuje Microsoft Edge WebView2 Runtime.\n\n" + exception.Message, "YamaSearch", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void ConfigureWebView(BrowserTab tab)
    {
        var core = tab.View.CoreWebView2;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsReputationCheckingRequired = _settings.Data.EnableSmartScreen;
        core.Settings.IsPasswordAutosaveEnabled = _settings.Data.OfferPasswordSave;
        core.Settings.IsGeneralAutofillEnabled = false;
        core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += (_, e) => BlockRequest(tab, e);
        core.WebMessageReceived += (_, e) => HandleNewTabMessage(tab, e);
        core.NavigationStarting += (_, _) => { if (_active == tab) StatusText.Text = "Načítání…"; };
        core.NavigationCompleted += (_, e) => { if (_active == tab) StatusText.Text = e.IsSuccess ? "Hotovo" : "Stránku se nepodařilo načíst"; UpdateTabTitle(tab); if (e.IsSuccess && Uri.TryCreate(core.Source, UriKind.Absolute, out var page) && page.Scheme is "http" or "https") AddHistory(core.Source, core.DocumentTitle, core.FaviconUri); };
        core.DocumentTitleChanged += (_, _) => UpdateTabTitle(tab);
        core.FaviconChanged += (_, _) => UpdateFavicon(tab);
        core.ContainsFullScreenElementChanged += (_, _) => Dispatcher.Invoke(() => SetVideoFullScreen(core.ContainsFullScreenElement));
        core.SourceChanged += (_, _) => { UpdateTabTitle(tab); if (_active == tab) SetAddressText(tab.IsYamaNewTab ? "YamaSearch — nová karta" : core.Source); };
        core.PermissionRequested += (_, e) => HandlePermissionRequest(e);
        core.NewWindowRequested += async (_, e) => { e.Handled = true; await CreateTabAsync(e.Uri); };
        core.DownloadStarting += (_, e) => { StatusText.Text = $"Stahování: {e.DownloadOperation.ResultFilePath}"; };
    }
    private async Task<CoreWebView2Environment> CreateWebViewEnvironmentAsync()
    {
        try
        {
            Directory.CreateDirectory(_webDataFolder);
            return await CoreWebView2Environment.CreateAsync(null, _webDataFolder);
        }
        catch (Exception exception) when (exception is ArgumentException or System.Runtime.InteropServices.COMException)
        {
            // A second development build can keep the normal profile in use. This fallback remains isolated.
            var fallback = Path.Combine(Path.GetTempPath(), "YamaSearch-WebView-" + Environment.ProcessId);
            Directory.CreateDirectory(fallback);
            StatusText.Text = "Používám izolovaný profil webového enginu…";
            return await CoreWebView2Environment.CreateAsync(null, fallback);
        }
    }

    private void BlockRequest(BrowserTab tab, CoreWebView2WebResourceRequestedEventArgs e)
    {
        if (_settings.Data.BlockMode == BlockMode.Off || string.IsNullOrEmpty(e.Request.Uri)) return;
        if (!Uri.TryCreate(e.Request.Uri, UriKind.Absolute, out var uri) || IsWhitelisted(uri.Host)) return;
        bool knownHost = _adHosts.Any(host => uri.Host.Equals(host, StringComparison.OrdinalIgnoreCase) || uri.Host.EndsWith('.' + host, StringComparison.OrdinalIgnoreCase));
        bool strictTracker = _settings.Data.BlockMode == BlockMode.Strict && (uri.AbsolutePath.Contains("analytics", StringComparison.OrdinalIgnoreCase) || uri.AbsolutePath.Contains("tracker", StringComparison.OrdinalIgnoreCase));
        if (knownHost || strictTracker)
        {
            e.Response = tab.View.CoreWebView2.Environment.CreateWebResourceResponse(null, 204, "Blocked by YamaBlock", "");
            tab.BlockedCount++;
            if (_active == tab) BlockedText.Text = $"YamaBlock · {tab.BlockedCount} blokováno";
        }
    }

    private bool IsWhitelisted(string host) => _settings.Data.Whitelist.Any(x => host.Equals(x, StringComparison.OrdinalIgnoreCase) || host.EndsWith('.' + x, StringComparison.OrdinalIgnoreCase));
    private async Task NavigateAsync(BrowserTab tab, string raw)
    {
        if (raw == "yamasearch://newtab")
        {
            tab.IsYamaNewTab = true;
            tab.View.CoreWebView2.NavigateToString(CreateNewTabHtml());
            return;
        }
        tab.IsYamaNewTab = false;
        var destination = _settings.Data.SearchEngine == "Custom" ? _settings.Data.CustomSearchEndpoint.Replace("{query}", Uri.EscapeDataString(raw.Trim())) : UrlTools.ToDestination(raw, _settings.Data.SearchEngine);
        if (!Uri.TryCreate(destination, UriKind.Absolute, out var uri)) { StatusText.Text = "Neplatná adresa"; return; }
        tab.View.Source = uri;
        await Task.CompletedTask;
    }
    private void SelectTab(BrowserTab tab)
    {
        _active = tab; BrowserHost.Children.Clear(); BrowserHost.Children.Add(tab.View);
        SetAddressText(tab.IsYamaNewTab ? "YamaSearch — nová karta" : tab.View.CoreWebView2?.Source ?? "");
        RenderTabs(); BlockedText.Text = $"YamaBlock · {tab.BlockedCount} blokováno";
    }
    private void RenderTabs()
    {
        TabsList.Items.Clear();
        var usableWidth = Math.Max(0, TabsScroller.ActualWidth - 42);
        var compact = _tabs.Count > 0 && usableWidth > 0 && _tabs.Count * 190 > usableWidth;
        var tabWidth = compact ? Math.Max(46, Math.Min(94, usableWidth / _tabs.Count)) : 190;
        var iconOnly = tabWidth < 82;
        foreach (var tab in _tabs)
        {
            var header = new StackPanel { Orientation = Orientation.Horizontal };
            header.Children.Add(new Image { Source = tab.Favicon ?? new BitmapImage(new Uri("pack://application:,,,/Assets/YamaSearch-symbol-64.png")), Width = 16, Height = 16, Margin = new Thickness(0, 0, iconOnly ? 0 : 7, 0) });
            if (!iconOnly) header.Children.Add(new TextBlock { Text = tab.Title, Width = tabWidth < 120 ? 55 : 125, TextTrimming = TextTrimming.CharacterEllipsis, VerticalAlignment = VerticalAlignment.Center });
            if (!compact)
            {
                var close = new Button { Content = "×", Padding = new Thickness(5, 0, 0, 0), Margin = new Thickness(5, 0, 0, 0), ToolTip = "Zavřít kartu" };
                close.Click += (_, e) => { e.Handled = true; CloseTab(tab); };
                header.Children.Add(close);
            }
            var button = new Button { Content = header, ToolTip = tab.Title, Width = tabWidth, Margin = new Thickness(3, 8, 0, 8), Background = tab == _active ? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1B2A42")) : new SolidColorBrush((Color)ColorConverter.ConvertFromString("#101B2B")), BorderBrush = tab == _active ? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3B80B8")) : new SolidColorBrush((Color)ColorConverter.ConvertFromString("#21324A")), BorderThickness = new Thickness(1), HorizontalContentAlignment = HorizontalAlignment.Left };
            button.PreviewMouseRightButtonDown += (_, e) =>
            {
                e.Handled = true;
                if (_tabActionsPopup != null) _tabActionsPopup.IsOpen = false;
                _tabActionsPopup = CreateTabActionsPopup(tab, button);
                _tabActionsPopup.IsOpen = true;
            };
            button.Click += (_, _) => SelectTab(tab);
            TabsList.Items.Add(button);
        }
    }
    private System.Windows.Controls.Primitives.Popup CreateTabActionsPopup(BrowserTab tab, Button target)
    {
        var popup = new System.Windows.Controls.Primitives.Popup { PlacementTarget = target, Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom, StaysOpen = true, AllowsTransparency = true, PopupAnimation = System.Windows.Controls.Primitives.PopupAnimation.Slide };
        var panel = new StackPanel { Margin = new Thickness(5) };
        void AddAction(string label, Action action, bool enabled = true)
        {
            var actionButton = new Button { Content = label, IsEnabled = enabled, HorizontalContentAlignment = HorizontalAlignment.Left, Padding = new Thickness(14, 9, 30, 9), Margin = new Thickness(0, 2, 0, 2), Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#14243A")) };
            actionButton.Click += (_, _) => { popup.IsOpen = false; _tabActionsPopup = null; action(); };
            panel.Children.Add(actionButton);
        }
        AddAction("✕  Zavřít kartu", () => CloseTab(tab));
        panel.Children.Add(new Border { Height = 1, Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#31537D")), Margin = new Thickness(7, 5, 7, 5) });
        AddAction("Zavřít ostatní karty", () => CloseOtherTabs(tab), _tabs.Count > 1);
        AddAction("Zavřít karty vpravo", () => CloseTabsToRight(tab), _tabs.IndexOf(tab) < _tabs.Count - 1);
        popup.Child = new Border { Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#101D30")), BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#38D9FF")), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(10), Child = panel, MinWidth = 215, Padding = new Thickness(3), Effect = new System.Windows.Media.Effects.DropShadowEffect { Color = Colors.Black, Opacity = .55, BlurRadius = 18, ShadowDepth = 6 } };
        return popup;
    }
    private void TabsScroller_SizeChanged(object sender, SizeChangedEventArgs e) => RenderTabs();
    private void UpdateTabTitle(BrowserTab tab) { tab.Title = tab.IsYamaNewTab ? "YamaSearch" : string.IsNullOrWhiteSpace(tab.View.CoreWebView2.DocumentTitle) ? "Nová karta" : tab.View.CoreWebView2.DocumentTitle; if (_active == tab) Dispatcher.Invoke(RenderTabs); }
    private void UpdateFavicon(BrowserTab tab)
    {
        if (Uri.TryCreate(tab.View.CoreWebView2.FaviconUri, UriKind.Absolute, out var favicon))
        {
            try { tab.Favicon = new BitmapImage(favicon); } catch { tab.Favicon = null; }
        }
        if (_active == tab) Dispatcher.Invoke(RenderTabs);
    }
    private void CloseTab(BrowserTab tab) { if (_tabs.Count == 1) { _ = NavigateAsync(tab, _settings.Data.HomePage); return; } var index = _tabs.IndexOf(tab); _tabs.Remove(tab); tab.View.Dispose(); SelectTab(_tabs[Math.Max(0, index - 1)]); }
    private void CloseOtherTabs(BrowserTab keep)
    {
        foreach (var tab in _tabs.Where(tab => tab != keep).ToList()) { _tabs.Remove(tab); tab.View.Dispose(); }
        SelectTab(keep);
    }
    private void CloseTabsToRight(BrowserTab keep)
    {
        var index = _tabs.IndexOf(keep);
        foreach (var tab in _tabs.Skip(index + 1).ToList()) { _tabs.Remove(tab); tab.View.Dispose(); }
        SelectTab(keep);
    }
    private void NewTab_Click(object sender, RoutedEventArgs e) => _ = CreateTabAsync();
    private void Back_Click(object sender, RoutedEventArgs e) { if (_active?.View.CoreWebView2.CanGoBack == true) _active.View.CoreWebView2.GoBack(); }
    private void Forward_Click(object sender, RoutedEventArgs e) { if (_active?.View.CoreWebView2.CanGoForward == true) _active.View.CoreWebView2.GoForward(); }
    private void Reload_Click(object sender, RoutedEventArgs e) => _active?.View.CoreWebView2.Reload();
    private void AddressBox_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter && _active != null) _ = NavigateAsync(_active, AddressBox.Text); }
    private void AddressBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        var query = AddressBox.Text.Trim(); AddressSuggestionList.Children.Clear();
        if (_suppressSuggestions || !AddressBox.IsKeyboardFocusWithin || query.Length < 1) { AddressSuggestions.IsOpen = false; return; }
        var search = CreateSuggestionButton($"Hledat „{query}“ v {_settings.Data.SearchEngine}", "Potvrďte Enterem nebo kliknutím", "⌕", true);
        search.Click += (_, _) => { AddressSuggestions.IsOpen = false; if (_active != null) _ = NavigateAsync(_active, query); };
        AddressSuggestionList.Children.Add(search);
        foreach (var item in _settings.Data.History.Where(x => x.Url.Contains(query, StringComparison.OrdinalIgnoreCase) || x.Title.Contains(query, StringComparison.OrdinalIgnoreCase)).Take(4))
        {
            var title = string.IsNullOrWhiteSpace(item.Title) ? item.Url : item.Title;
            var suggestion = CreateSuggestionButton(title, item.Url, "↗", false, item.FaviconUrl);
            suggestion.Click += (_, _) => { AddressSuggestions.IsOpen = false; if (_active != null) _ = NavigateAsync(_active, item.Url); };
            AddressSuggestionList.Children.Add(suggestion);
        }
        AddressSuggestions.IsOpen = true;
    }
    private static Button CreateSuggestionButton(string title, string subtitle, string glyph, bool highlight, string? faviconUrl = null)
    {
        var layout = new Grid();
        layout.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(28) });
        layout.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        if (Uri.TryCreate(faviconUrl, UriKind.Absolute, out var favicon))
        {
            try { layout.Children.Add(new Image { Source = new BitmapImage(favicon), Width = 16, Height = 16, VerticalAlignment = VerticalAlignment.Center }); }
            catch { layout.Children.Add(new TextBlock { Text = glyph, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#54D7F8")), FontSize = 15, VerticalAlignment = VerticalAlignment.Center }); }
        }
        else layout.Children.Add(new TextBlock { Text = glyph, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#54D7F8")), FontSize = 15, VerticalAlignment = VerticalAlignment.Center });
        var text = new StackPanel();
        text.Children.Add(new TextBlock { Text = title, Foreground = Brushes.White, TextTrimming = TextTrimming.CharacterEllipsis, FontWeight = highlight ? FontWeights.SemiBold : FontWeights.Normal });
        text.Children.Add(new TextBlock { Text = subtitle, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#91A8C2")), FontSize = 11, TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(0, 2, 0, 0) });
        Grid.SetColumn(text, 1); layout.Children.Add(text);
        var baseBackground = highlight ? "#1C3553" : "#132238";
        var button = new Button { Content = layout, HorizontalContentAlignment = HorizontalAlignment.Stretch, Padding = new Thickness(11, 8, 11, 8), Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(baseBackground)), BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(highlight ? "#315B82" : "#1D3857")), BorderThickness = new Thickness(1), Margin = new Thickness(0, 3, 0, 3) };
        button.MouseEnter += (_, _) => { button.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#21496B")); button.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#38D9FF")); };
        button.MouseLeave += (_, _) => { button.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(baseBackground)); button.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(highlight ? "#315B82" : "#1D3857")); };
        return button;
    }
    private void SetAddressText(string value)
    {
        _suppressSuggestions = true;
        AddressBox.Text = value;
        _suppressSuggestions = false;
        AddressSuggestions.IsOpen = false;
    }
    private void Go_Click(object sender, RoutedEventArgs e)
    {
        if (_active?.View.CoreWebView2 != null) _ = NavigateAsync(_active, AddressBox.Text);
        else StatusText.Text = "Webový engine se ještě spouští…";
    }
    private void Bookmark_Click(object sender, RoutedEventArgs e)
    {
        if (_active?.View.CoreWebView2 == null) return;
        if (_active.IsYamaNewTab)
        {
            StatusText.Text = "Oblíbené můžeš přidávat a odebírat přímo na nové kartě.";
            return;
        }

        var url = _active.View.CoreWebView2.Source;
        if (!TryNormalizeFavoriteUrl(url, out var normalized)) return;

        var index = FindFavoriteIndex(normalized);
        if (index >= 0)
        {
            _settings.Data.Bookmarks.RemoveAt(index);
            _settings.Save();
            StatusText.Text = "Odebráno z oblíbených";
        }
        else
        {
            _settings.Data.Bookmarks.Insert(0, normalized);
            _settings.Save();
            StatusText.Text = "Přidáno do oblíbených";
        }

        RefreshFavoriteViews();
    }
    private void Menu_Click(object sender, RoutedEventArgs e)
    {
        bool opening = SidePanel.Visibility != Visibility.Visible;
        SidePanel.Visibility = opening ? Visibility.Visible : Visibility.Collapsed;
        PanelColumn.Width = opening ? new GridLength(300) : new GridLength(0);
        if (opening) ShowBookmarksPanel();
    }
    private void BookmarksPanel_Click(object sender, RoutedEventArgs e) => ShowBookmarksPanel();
    private void HistoryPanel_Click(object sender, RoutedEventArgs e) => ShowHistoryPanel();
    private void Settings_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SettingsWindow(_settings, _active?.View.CoreWebView2?.Profile) { Owner = this };
        if (dialog.ShowDialog() == true) { _settings.Save(); StatusText.Text = "Nastavení bylo uloženo"; }
    }
    private void ShowBookmarksPanel()
    {
        PanelTitle.Text = "Oblíbené"; PanelList.Items.Clear();

        if (_active?.View.CoreWebView2 != null && !_active.IsYamaNewTab && TryNormalizeFavoriteUrl(_active.View.CoreWebView2.Source, out var currentUrl))
        {
            var currentIsFavorite = FindFavoriteIndex(currentUrl) >= 0;
            var currentButton = new Button
            {
                Content = currentIsFavorite ? "★  Odebrat aktuální stránku" : "☆  Přidat aktuální stránku",
                HorizontalContentAlignment = HorizontalAlignment.Left,
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(currentIsFavorite ? "#35202B" : "#17334A")),
                Margin = new Thickness(0, 0, 0, 10)
            };
            currentButton.Click += (_, _) =>
            {
                var index = FindFavoriteIndex(currentUrl);
                if (index >= 0) _settings.Data.Bookmarks.RemoveAt(index);
                else _settings.Data.Bookmarks.Insert(0, currentUrl);
                _settings.Save();
                RefreshFavoriteViews();
                ShowBookmarksPanel();
            };
            PanelList.Items.Add(currentButton);
        }

        if (_settings.Data.Bookmarks.Count == 0)
        {
            PanelList.Items.Add(new TextBlock { Text = "Zatím nemáte uložené žádné oblíbené stránky.", Foreground = (Brush)FindResource("MutedBrush"), TextWrapping = TextWrapping.Wrap });
            return;
        }

        foreach (var url in _settings.Data.Bookmarks.ToList()) PanelList.Items.Add(CreateBookmarkPanelItem(url));
    }
    private void ShowHistoryPanel()
    {
        PanelTitle.Text = "Historie"; PanelList.Items.Clear();
        if (_settings.Data.History.Count == 0) PanelList.Items.Add(new TextBlock { Text = "Historie je zatím prázdná.", Foreground = (Brush)FindResource("MutedBrush") });
        foreach (var item in _settings.Data.History.Take(50)) PanelList.Items.Add(CreatePanelLink(item.Url, string.IsNullOrWhiteSpace(item.Title) ? item.Url : item.Title));
    }
    private FrameworkElement CreateBookmarkPanelItem(string url)
    {
        var row = new Grid { Margin = new Thickness(0, 2, 0, 2) };
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var history = _settings.Data.History.FirstOrDefault(x => SameFavorite(x.Url, url));
        var label = string.IsNullOrWhiteSpace(history?.Title)
            ? (Uri.TryCreate(url, UriKind.Absolute, out var page) ? page.Host : url)
            : history.Title;

        var open = new Button { Content = label, ToolTip = url, HorizontalContentAlignment = HorizontalAlignment.Left, Padding = new Thickness(10, 8, 8, 8) };
        open.Click += (_, _) => { if (_active != null) _ = NavigateAsync(_active, url); };
        row.Children.Add(open);

        var remove = new Button
        {
            Content = "×",
            ToolTip = "Odebrat z oblíbených",
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FFB7C5")),
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#35202B")),
            Padding = new Thickness(9, 7, 9, 7),
            Margin = new Thickness(5, 0, 0, 0)
        };
        Grid.SetColumn(remove, 1);
        remove.Click += (_, _) =>
        {
            RemoveFavorite(url);
            ShowBookmarksPanel();
        };
        row.Children.Add(remove);
        return row;
    }
    private Button CreatePanelLink(string url, string label)
    {
        var item = new Button { Content = label, ToolTip = url, HorizontalContentAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 2, 0, 2) };
        item.Click += (_, _) => { if (_active != null) _ = NavigateAsync(_active, url); }; return item;
    }

    private void HandleNewTabMessage(BrowserTab tab, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!tab.IsYamaNewTab) return;

        try
        {
            var json = e.TryGetWebMessageAsString();
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (!root.TryGetProperty("action", out var actionElement) || !root.TryGetProperty("url", out var urlElement)) return;
            var action = actionElement.GetString();
            var url = urlElement.GetString() ?? "";

            if (string.Equals(action, "addFavorite", StringComparison.Ordinal))
            {
                if (!TryNormalizeFavoriteUrl(url, out var normalized))
                {
                    StatusText.Text = "Zadej platnou HTTP(S) adresu.";
                    return;
                }

                if (FindFavoriteIndex(normalized) < 0)
                {
                    _settings.Data.Bookmarks.Insert(0, normalized);
                    _settings.Save();
                    StatusText.Text = "Přidáno do oblíbených";
                }
                else StatusText.Text = "Tato stránka už je v oblíbených.";

                RefreshFavoriteViews();
                return;
            }

            if (string.Equals(action, "removeFavorite", StringComparison.Ordinal))
            {
                RemoveFavorite(url);
            }
        }
        catch
        {
            StatusText.Text = "Oblíbené se nepodařilo změnit.";
        }
    }

    private void RemoveFavorite(string url)
    {
        var index = FindFavoriteIndex(url);
        if (index < 0) return;
        _settings.Data.Bookmarks.RemoveAt(index);
        _settings.Save();
        StatusText.Text = "Odebráno z oblíbených";
        RefreshFavoriteViews();
    }

    private void RefreshFavoriteViews()
    {
        foreach (var tab in _tabs.Where(x => x.IsYamaNewTab && x.View.CoreWebView2 != null).ToList())
            tab.View.CoreWebView2.NavigateToString(CreateNewTabHtml());

        if (SidePanel.Visibility == Visibility.Visible && PanelTitle.Text == "Oblíbené")
            ShowBookmarksPanel();
    }

    private int FindFavoriteIndex(string url)
        => _settings.Data.Bookmarks.FindIndex(existing => SameFavorite(existing, url));

    private static bool SameFavorite(string left, string right)
    {
        if (!TryNormalizeFavoriteUrl(left, out var a) || !TryNormalizeFavoriteUrl(right, out var b))
            return string.Equals(left.Trim(), right.Trim(), StringComparison.OrdinalIgnoreCase);
        return string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
    }

    private static bool TryNormalizeFavoriteUrl(string raw, out string normalized)
    {
        normalized = "";
        raw = raw.Trim();
        if (string.IsNullOrWhiteSpace(raw)) return false;
        if (!raw.Contains("://", StringComparison.Ordinal) && raw.Contains('.', StringComparison.Ordinal)) raw = "https://" + raw;
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https")) return false;
        normalized = uri.GetComponents(UriComponents.SchemeAndServer | UriComponents.PathAndQuery, UriFormat.UriEscaped);
        if (string.IsNullOrEmpty(uri.AbsolutePath) || uri.AbsolutePath == "/")
            normalized = uri.GetLeftPart(UriPartial.Authority) + "/";
        return true;
    }
    private void AddHistory(string url, string title, string faviconUrl)
    {
        _settings.Data.History.RemoveAll(x => x.Url == url);
        _settings.Data.History.Insert(0, new HistoryEntry { Url = url, Title = title, FaviconUrl = faviconUrl, VisitedAt = DateTimeOffset.Now });
        if (_settings.Data.History.Count > 500) _settings.Data.History.RemoveRange(500, _settings.Data.History.Count - 500);
        _settings.Save();
    }
    private void BlockButton_Click(object sender, RoutedEventArgs e)
    {
        var next = _settings.Data.BlockMode switch { BlockMode.Standard => BlockMode.Strict, BlockMode.Strict => BlockMode.Off, _ => BlockMode.Standard };
        _settings.Data.BlockMode = next;
        _settings.Save();
        UpdateBlockButton();
        StatusText.Text = $"YamaBlock: {next.ToLabel()} (uloženo pro příští spuštění)";
    }

    private void UpdateBlockButton()
    {
        var mode = _settings.Data.BlockMode;
        BlockButton.Content = mode switch
        {
            BlockMode.Strict => "◆  YamaBlock · Přísný",
            BlockMode.Off => "○  YamaBlock · Vypnuto",
            _ => "●  YamaBlock · Standard"
        };
        BlockButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(mode switch
        {
            BlockMode.Strict => "#5B2A18",
            BlockMode.Off => "#202B3B",
            _ => "#0C4051"
        }));
        BlockButton.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(mode switch
        {
            BlockMode.Strict => "#F59E0B",
            BlockMode.Off => "#52657F",
            _ => "#22D3EE"
        }));
        BlockButton.BorderThickness = new Thickness(1);
        BlockButton.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(mode switch
        {
            BlockMode.Strict => "#FCD34D",
            BlockMode.Off => "#B7C4D6",
            _ => "#A5F3FC"
        }));
        BlockButton.FontWeight = FontWeights.SemiBold;
    }
    private void ShieldButton_Click(object sender, RoutedEventArgs e)
    {
        var page = _active?.View.CoreWebView2.Source;
        var dialog = new ShieldWindow(_settings, page);
        if (dialog.ShowDialog() == true)
        {
            _settings.Save();
            foreach (var tab in _tabs.Where(x => x.View.CoreWebView2 != null))
            {
                tab.View.CoreWebView2.Settings.IsReputationCheckingRequired = _settings.Data.EnableSmartScreen;
                tab.View.CoreWebView2.Settings.IsPasswordAutosaveEnabled = _settings.Data.OfferPasswordSave;
            }
            UpdateBlockButton();
            StatusText.Text = "Nastavení YamaShield bylo uloženo";
        }
    }
    private void HandlePermissionRequest(CoreWebView2PermissionRequestedEventArgs e)
    {
        var sensitive = e.PermissionKind is CoreWebView2PermissionKind.Camera or CoreWebView2PermissionKind.Microphone or CoreWebView2PermissionKind.Geolocation or CoreWebView2PermissionKind.Notifications or CoreWebView2PermissionKind.ClipboardRead;
        if (!sensitive) { e.State = CoreWebView2PermissionState.Default; return; }
        var label = e.PermissionKind switch { CoreWebView2PermissionKind.Camera => "kameru", CoreWebView2PermissionKind.Microphone => "mikrofon", CoreWebView2PermissionKind.Geolocation => "polohu", CoreWebView2PermissionKind.Notifications => "notifikace", _ => "schránku" };
        var answer = MessageBox.Show($"{e.Uri} chce použít {label}.\n\nPovolit pouze pro toto rozhodnutí?", "YamaShield", MessageBoxButton.YesNo, MessageBoxImage.Question);
        e.State = answer == MessageBoxResult.Yes ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
    }
    private void ThemeButton_Click(object sender, RoutedEventArgs e)
    {
        _settings.Data.Theme = _settings.Data.Theme.Equals("dark", StringComparison.OrdinalIgnoreCase) ? "light" : "dark";
        ApplyTheme(_settings.Data.Theme); _settings.Save();
        StatusText.Text = _settings.Data.Theme.Equals("dark") ? "Tmavý vzhled" : "Světlý vzhled";
    }
    private void TitleBar_MouseDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton == MouseButton.Left && !IsInteractiveHeaderElement(e.OriginalSource as DependencyObject))
        {
            if (e.ClickCount == 2) WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
            else DragMove();
        }
    }
    private static bool IsInteractiveHeaderElement(DependencyObject? source)
    {
        while (source != null)
        {
            if (source is Button or TextBox or ScrollViewer) return true;
            source = VisualTreeHelper.GetParent(source);
        }
        return false;
    }
    private void SetVideoFullScreen(bool enabled)
    {
        var rows = ((Grid)Content).RowDefinitions;
        if (enabled)
        {
            rows[0].Height = new GridLength(0); rows[1].Height = new GridLength(0); rows[3].Height = new GridLength(0);
            WindowState = WindowState.Maximized;
        }
        else
        {
            rows[0].Height = new GridLength(54); rows[1].Height = new GridLength(64); rows[3].Height = new GridLength(30);
        }
    }
    private void Minimize_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;
    private void Maximize_Click(object sender, RoutedEventArgs e) => WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
    private void Close_Click(object sender, RoutedEventArgs e) => Close();
    private void MainWindow_KeyDown(object sender, KeyEventArgs e) { if (Keyboard.Modifiers == ModifierKeys.Control && e.Key == Key.T) { _ = CreateTabAsync(); e.Handled = true; } if (Keyboard.Modifiers == ModifierKeys.Control && e.Key == Key.L) { AddressBox.Focus(); AddressBox.SelectAll(); e.Handled = true; } }
    private void ApplyTheme(string theme)
    {
        bool light = theme.Equals("light", StringComparison.OrdinalIgnoreCase);
        Resources["WindowBrush"] = new SolidColorBrush((Color)ColorConverter.ConvertFromString(light ? "#F5F8FC" : "#0B101A"));
        Resources["SurfaceBrush"] = new SolidColorBrush((Color)ColorConverter.ConvertFromString(light ? "#FFFFFF" : "#121A27"));
        Resources["SurfaceRaisedBrush"] = new SolidColorBrush((Color)ColorConverter.ConvertFromString(light ? "#EAF0F8" : "#192437"));
        Resources["TextBrush"] = new SolidColorBrush((Color)ColorConverter.ConvertFromString(light ? "#10213B" : "#EAF3FF"));
        Resources["MutedBrush"] = new SolidColorBrush((Color)ColorConverter.ConvertFromString(light ? "#52657B" : "#96A7BD"));
    }
    private void SetDarkWindowBorder()
    {
        const int DwmwaBorderColor = 34;
        const int DwmwaCaptionColor = 35;
        int colorRef = 0x001A100B; // BGR: #0B101A
        var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
        DwmSetWindowAttribute(handle, DwmwaBorderColor, ref colorRef, sizeof(int));
        DwmSetWindowAttribute(handle, DwmwaCaptionColor, ref colorRef, sizeof(int));
    }
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int valueSize);
    private string CreateNewTabHtml()
    {
        var assetFolder = Path.Combine(AppContext.BaseDirectory, "Assets");
        var brandPath = Path.Combine(assetFolder, "YamaSearch-brand.png");
        var symbolPath = Path.Combine(assetFolder, "YamaSearch-symbol-64.png");
        var brand = File.Exists(brandPath) ? Convert.ToBase64String(File.ReadAllBytes(brandPath)) : "";
        var symbol = File.Exists(symbolPath) ? Convert.ToBase64String(File.ReadAllBytes(symbolPath)) : brand;

        var favorites = _settings.Data.Bookmarks.Take(12).Select(url =>
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var page) || page.Scheme is not ("http" or "https")) return "";

            var history = _settings.Data.History.FirstOrDefault(x =>
            {
                if (string.Equals(x.Url, url, StringComparison.OrdinalIgnoreCase)) return true;
                return Uri.TryCreate(x.Url, UriKind.Absolute, out var historyPage)
                    && string.Equals(historyPage.Host, page.Host, StringComparison.OrdinalIgnoreCase);
            });

            var label = string.IsNullOrWhiteSpace(history?.Title) ? page.Host.Replace("www.", "", StringComparison.OrdinalIgnoreCase) : history.Title.Trim();
            if (label.Length > 28) label = label[..27] + "…";

            var faviconUrl = history?.FaviconUrl ?? "";
            if (!Uri.TryCreate(faviconUrl, UriKind.Absolute, out var favicon)
                || favicon.Scheme is not ("http" or "https"))
            {
                faviconUrl = $"{page.Scheme}://{page.Host}/favicon.ico";
            }

            var safeUrl = System.Net.WebUtility.HtmlEncode(url);
            var safeLabel = System.Net.WebUtility.HtmlEncode(label);
            var safeHost = System.Net.WebUtility.HtmlEncode(page.Host);
            var safeFavicon = System.Net.WebUtility.HtmlEncode(faviconUrl);
            return $"<div class='favorite-card' data-url='{safeUrl}' title='{safeHost}'><button class='favorite-remove' type='button' title='Odebrat z oblíbených' onclick='removeFavorite(event,this)'>×</button><a class='favorite-main' href='{safeUrl}'><span class='favorite-icon'><img src='{safeFavicon}' alt='' onerror=\"this.onerror=null;this.src='data:image/png;base64,{symbol}'\"></span><span class='favorite-name'>{safeLabel}</span><span class='favorite-host'>{safeHost}</span></a></div>";
        }).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();

        var favoriteContent = favorites.Count > 0
            ? string.Join("", favorites)
            : "<div class='favorites-empty'>Zatím tu nic není. Klikni na „Přidat stránku“ a vlož adresu webu.</div>";

        var suggestions = _settings.Data.History.Take(20)
            .Concat(_settings.Data.Bookmarks.Select(url => new HistoryEntry { Url = url, Title = url }))
            .Where(x => !string.IsNullOrWhiteSpace(x.Url))
            .Select(x => $"<option value='{System.Net.WebUtility.HtmlEncode(x.Url)}'>{System.Net.WebUtility.HtmlEncode(x.Title)}</option>");

        return string.Format(
            """
            <!doctype html><html><head><meta charset='utf-8'><style>
            *{{box-sizing:border-box}}
            body{{margin:0;background:#0b101a;color:#eaf3ff;font-family:Segoe UI,Arial;min-height:100vh}}
            main{{width:min(860px,90vw);margin:0 auto;padding:clamp(72px,11vh,132px) 0 60px;text-align:center}}
            .brand{{width:min(430px,78vw);height:auto;display:block;margin:0 auto 22px;filter:drop-shadow(0 18px 42px #087eaa33)}}
            p{{color:#9fb2c9;font-size:17px}}
            .provider{{color:#66dfff;font-size:13px}}
            form{{margin:32px auto 0;display:flex;background:#192437;border:1px solid #31537d;border-radius:16px;padding:7px;max-width:610px;box-shadow:0 12px 34px #00000022}}
            input{{flex:1;background:transparent;border:0;color:#fff;font-size:16px;padding:12px;outline:0;min-width:0}}
            button{{background:#12add8;color:#041018;border:0;border-radius:11px;font-weight:700;padding:0 20px;cursor:pointer}}
            .favorites-section{{margin-top:38px;text-align:left}}
            .favorites-head{{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#eaf3ff;font-size:17px;font-weight:650;margin:0 0 14px 4px}}
            .favorites-title{{display:flex;align-items:center;gap:10px}}
            .favorites-star{{color:#23c9f5;font-size:20px;filter:drop-shadow(0 0 10px #23c9f566)}}
            .favorites-add{{background:#142a42;color:#a9eaff;border:1px solid #31537d;border-radius:10px;padding:8px 12px;font-weight:650}}
            .favorites-add:hover{{background:#1c3a59;border-color:#23c9f5}}
            .add-panel{{display:none;gap:8px;margin:0 0 14px;padding:10px;background:#111d30;border:1px solid #294465;border-radius:12px}}
            .add-panel.open{{display:flex}}
            .add-panel input{{background:#192437;border:1px solid #31537d;border-radius:9px;padding:10px 12px}}
            .add-panel button{{padding:0 16px}}
            .favorites-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(138px,1fr));gap:14px}}
            .favorite-card{{position:relative;min-height:126px;border-radius:15px;border:1px solid #294465;background:linear-gradient(180deg,#142137,#101a2b);color:#eaf3ff;transition:transform .15s ease,border-color .15s ease,background .15s ease,box-shadow .15s ease;overflow:hidden}}
            .favorite-card:hover{{transform:translateY(-2px);border-color:#3b80b8;background:linear-gradient(180deg,#192a44,#122139);box-shadow:0 12px 26px #00000030,0 0 0 1px #23c9f522}}
            .favorite-main{{min-height:126px;padding:17px 14px 14px;text-decoration:none;color:#eaf3ff;display:flex;flex-direction:column;align-items:center;justify-content:center}}
            .favorite-remove{{position:absolute;z-index:2;right:7px;top:7px;width:25px;height:25px;padding:0;border-radius:8px;background:#3a2030;color:#ffbdc9;border:1px solid #654052;opacity:.72;font-size:16px;line-height:20px}}
            .favorite-card:hover .favorite-remove{{opacity:1}}
            .favorite-remove:hover{{background:#5a263c;border-color:#d85a7b}}
            .favorite-icon{{width:42px;height:42px;border-radius:11px;background:#0d1727;border:1px solid #2d4667;display:grid;place-items:center;margin-bottom:10px;overflow:hidden}}
            .favorite-icon img{{width:28px;height:28px;object-fit:contain}}
            .favorite-name{{font-weight:650;font-size:14px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
            .favorite-host{{font-size:11px;color:#8fa4be;margin-top:4px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
            .favorites-empty{{grid-column:1/-1;border:1px dashed #294465;border-radius:14px;padding:22px;color:#8fa4be;text-align:center;background:#101a2912}}
            @media(max-width:700px){{main{{padding-top:58px}}.favorites-grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}
            </style></head><body><main>
            <img class='brand' src='data:image/png;base64,{0}' alt='YamaSearch'>
            <p>Rychlé hledání. YamaBlock proti reklamám. YamaShield pro bezpečnější prohlížení.</p>
            <div class='provider'>Hledání: {3}</div>
            <form action='{1}'><input name='q' list='yamasearch-suggestions' autocomplete='off' placeholder='Hledat na webu nebo zadat adresu'><datalist id='yamasearch-suggestions'>{4}</datalist><button>Hledat</button></form>
            <section class='favorites-section'>
              <div class='favorites-head'><span class='favorites-title'><span class='favorites-star'>★</span><span>Oblíbené stránky</span></span><button class='favorites-add' type='button' onclick='toggleAdd()'>＋ Přidat stránku</button></div>
              <form id='favoriteAddPanel' class='add-panel' onsubmit='addFavorite(event)'><input id='favoriteUrl' type='text' autocomplete='off' placeholder='např. youtube.com'><button type='submit'>Přidat</button></form>
              <div class='favorites-grid'>{2}</div>
            </section>
            <script>
            const postFavorite=(action,url)=>window.chrome.webview.postMessage(JSON.stringify({{action,url}}));
            function toggleAdd(){{const panel=document.getElementById('favoriteAddPanel');panel.classList.toggle('open');if(panel.classList.contains('open'))document.getElementById('favoriteUrl').focus();}}
            function addFavorite(event){{event.preventDefault();const input=document.getElementById('favoriteUrl');const url=input.value.trim();if(!url)return;postFavorite('addFavorite',url);}}
            function removeFavorite(event,button){{event.preventDefault();event.stopPropagation();const card=button.closest('.favorite-card');if(card)postFavorite('removeFavorite',card.dataset.url);}}
            </script>
            </main></body></html>
            """,
            brand,
            SearchEndpoint(),
            favoriteContent,
            System.Net.WebUtility.HtmlEncode(_settings.Data.SearchEngine),
            string.Join("", suggestions));
    }
    private string SearchEndpoint() => _settings.Data.SearchEngine switch { "Google" => "https://www.google.com/search", "Bing" => "https://www.bing.com/search", "Seznam" => "https://search.seznam.cz/", "Brave Search" => "https://search.brave.com/search", "Ecosia" => "https://www.ecosia.org/search", "Yahoo" => "https://search.yahoo.com/search", "Startpage" => "https://www.startpage.com/sp/search", "Custom" => _settings.Data.CustomSearchEndpoint.Replace("{query}", ""), _ => "https://duckduckgo.com/" };
}

public sealed class BrowserTab { public WebView2 View { get; } = new() { DefaultBackgroundColor = System.Drawing.Color.FromArgb(0x0B, 0x10, 0x1A) }; public string Title { get; set; } = "Nová karta"; public ImageSource? Favicon { get; set; } public bool IsYamaNewTab { get; set; } public int BlockedCount { get; set; } }
public enum BlockMode { Off, Standard, Strict }
public enum SecurityLevel { Recommended, Strict, Custom }
public static class BlockModeExtensions { public static string ToLabel(this BlockMode mode) => mode switch { BlockMode.Off => "Vypnuto", BlockMode.Strict => "Přísný", _ => "Standard" }; }
public static class UrlTools
{
    public static string ToDestination(string input, string engine)
    {
        input = input.Trim(); if (Uri.TryCreate(input, UriKind.Absolute, out var direct) && (direct.Scheme == "http" || direct.Scheme == "https")) return direct.ToString();
        if (input.Contains('.') && !input.Contains(' ')) return "https://" + input;
        var query = Uri.EscapeDataString(input); return engine switch { "Google" => "https://www.google.com/search?q=" + query, "Bing" => "https://www.bing.com/search?q=" + query, "Seznam" => "https://search.seznam.cz/?q=" + query, "Brave Search" => "https://search.brave.com/search?q=" + query, "Ecosia" => "https://www.ecosia.org/search?q=" + query, "Yahoo" => "https://search.yahoo.com/search?p=" + query, "Startpage" => "https://www.startpage.com/sp/search?query=" + query, _ => "https://duckduckgo.com/?q=" + query };
    }
}
public sealed class AppData { public string Theme { get; set; } = "dark"; public string HomePage { get; set; } = "yamasearch://newtab"; public string SearchEngine { get; set; } = "DuckDuckGo"; public string CustomSearchEndpoint { get; set; } = ""; public bool OnboardingCompleted { get; set; } = false; public BlockMode BlockMode { get; set; } = BlockMode.Standard; public SecurityLevel SecurityLevel { get; set; } = SecurityLevel.Recommended; public bool EnableSmartScreen { get; set; } = true; public bool OfferPasswordSave { get; set; } = true; public List<string> Whitelist { get; set; } = []; public List<string> Bookmarks { get; set; } = []; public List<HistoryEntry> History { get; set; } = []; }
public sealed class HistoryEntry { public string Url { get; set; } = ""; public string Title { get; set; } = ""; public string FaviconUrl { get; set; } = ""; public DateTimeOffset VisitedAt { get; set; } }
public sealed class SettingsStore
{
    private readonly string _path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YamaSearch", "settings.json");
    public AppData Data { get; }
    public SettingsStore() { try { Data = File.Exists(_path) ? JsonSerializer.Deserialize<AppData>(File.ReadAllText(_path)) ?? new() : new(); } catch { Data = new(); } }
    public void Save() { Directory.CreateDirectory(Path.GetDirectoryName(_path)!); File.WriteAllText(_path, JsonSerializer.Serialize(Data, new JsonSerializerOptions { WriteIndented = true })); }
}
