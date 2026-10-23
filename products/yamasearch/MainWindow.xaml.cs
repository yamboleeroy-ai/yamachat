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
using System.Windows.Media.Animation;
using System.Text.RegularExpressions;

namespace YamaSearch;

public partial class MainWindow : Window
{
    private async void PortalReturn_Click(object sender, RoutedEventArgs e)
    {
        if (!await PortalReturn.TryReturnAsync())
            MessageBox.Show(this, "Yamaportal už není dostupný. YamaSearch může dál běžet samostatně.", "Yamaportal", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    internal Guid WindowId => _windowId;

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out NativePoint point);

    private readonly ObservableCollection<BrowserTab> _tabs = [];
    private readonly SettingsStore _settings = new();
    private readonly string? _startupUrl;
    private readonly bool _siteAppMode;
    private readonly string? _siteAppId;
    private readonly string? _manageAppId;
    private readonly bool _isPrivateWindow;
    // A private WebView profile belongs to its live tabs, not to one window.
    // Moving a tab must never make its profile eligible for deletion.
    private PrivateWebSession? _privateWebSession;
    private SiteAppEntry? _siteAppEntry;
    private System.Windows.Controls.Primitives.Popup? _siteAppMenuPopup;
    private static readonly HttpClient UpdateClient = new() { Timeout = TimeSpan.FromMinutes(5) };
    private const string UpdateManifestUrl = "https://updates.yamachat.eu/yamasearch/latest.json";
    private BrowserTab? _active;
    private System.Windows.Controls.Primitives.Popup? _tabActionsPopup;
    private bool _suppressSuggestions;
    private int _addressSuggestionIndex = -1;
    private string _lastFindQuery = "";
    private bool _downloadUiRefreshQueued;
    private Point? _tabDragOrigin;
    private BrowserTab? _draggedTab;
    private System.Windows.Controls.Primitives.Popup? _tabDragPreview;
    private static readonly HashSet<System.Windows.Controls.Primitives.Popup> ActiveTabDragPreviews = [];
    private readonly bool _startEmpty;
    private readonly Guid _windowId = Guid.NewGuid();
    private bool _isClosing;
    private bool _suppressTabClick;
    private Button? _tabDropTarget;
    private bool _tabDropAfter;
    private readonly Dictionary<CoreWebView2DownloadOperation, DownloadEntry> _activeDownloads = [];
    private readonly List<string> _favoriteOverflow = [];
    private bool _customMaximized;
    private bool _videoFullScreen;
    private bool _wasMaximizedBeforeVideo;
    private bool _sidePanelWasVisibleBeforeVideo;
    private int _siteInfoRenderVersion;
    private int _profileAvatarVersion;
    private PendingSitePermissionRequest? _pendingSitePermissionRequest;
    private Rect _restoreWindowBounds;
    private Rect _videoRestoreBounds;
    private readonly string _webDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YamaSearch", "WebView");
    private readonly SemaphoreSlim _permissionPromptGate = new(1, 1);
    private static readonly object WebViewEnvironmentLock = new();
    private static Task<CoreWebView2Environment>? _normalWebViewEnvironmentTask;
    private readonly HashSet<string> _adHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com",
        "adservice.google.cz", "googletagservices.com", "amazon-adsystem.com", "adnxs.com",
        "criteo.com", "criteo.net", "taboola.com", "outbrain.com"
    };
    private readonly HashSet<string> _trackerHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "google-analytics.com", "analytics.google.com", "googletagmanager.com", "connect.facebook.net",
        "scorecardresearch.com", "hotjar.com", "hotjar.io", "clarity.ms"
    };
    private static readonly string[] StrictUrlTokens =
    [
        "/analytics", "/tracker", "/tracking", "/telemetry", "/pixel", "/beacon",
        "collect?v=", "event.gif", "imp.gif"
    ];

    public MainWindow(string? startupUrl = null, bool siteAppMode = false, string? siteAppId = null, string? manageAppId = null, bool privateWindow = false, bool startEmpty = false)
    {
        _startupUrl = startupUrl;
        _siteAppMode = siteAppMode;
        _siteAppId = siteAppId;
        _manageAppId = manageAppId;
        _isPrivateWindow = privateWindow;
        _startEmpty = startEmpty;
        if (_isPrivateWindow)
            _privateWebSession = new PrivateWebSession();
        _siteAppEntry = !string.IsNullOrWhiteSpace(siteAppId)
            ? _settings.Data.InstalledApps.FirstOrDefault(x => x.Id == siteAppId)
            : null;
        InitializeComponent();
        PortalReturnButton.Visibility = PortalReturn.Available ? Visibility.Visible : Visibility.Collapsed;
        App.Accounts.StateChanged += Accounts_StateChanged;
        Loaded += (_, _) => TabWindowRegistry.Register(_windowId, this);
        Closing += (_, _) =>
        {
            _isClosing = true;
            foreach (var tab in _tabs.ToArray()) CancelPendingSitePermissionRequest(tab);
        };
        Closed += (_, _) =>
        {
            TabWindowRegistry.Unregister(_windowId);
            App.Accounts.StateChanged -= Accounts_StateChanged;
        };
        if (_isPrivateWindow)
        {
            Title = "YamaSearch · Anonymní okno";
            BrandColumn.Width = new GridLength(310);
            PrivateModeBadge.Visibility = Visibility.Visible;
            Closed += (_, _) => CleanupPrivateWebData();
        }
        SourceInitialized += (_, _) => InitializeWindowInterop();
        if (!_settings.Data.Theme.Equals("dark", StringComparison.OrdinalIgnoreCase))
        {
            _settings.Data.Theme = "dark";
            _settings.Save();
        }
        ApplyTheme("dark");
        RecoverInterruptedDownloads();
        UpdateShieldButton();
        UpdateBlockButton();
        UpdateDownloadToolbar();
        RenderAccountUi();
        ShowFavoritesBarCheckBox.IsChecked = _settings.Data.FavoritesBarVisible;
        FavoritesBar.Visibility = _settings.Data.FavoritesBarVisible ? Visibility.Visible : Visibility.Collapsed;
        Loaded += (_, _) => RenderFavoritesBar();
        if (_siteAppMode)
            ApplySiteAppMode();
        KeyDown += MainWindow_KeyDown;
        Closed += (_, _) => CloseTabDragPreview();
    }

    private void RecoverInterruptedDownloads()
    {
        var changed = false;
        foreach (var entry in _settings.Data.Downloads.Where(x => x.State == "Probíhá"))
        {
            entry.State = "Přerušeno";
            entry.CompletedAt ??= DateTimeOffset.Now;
            changed = true;
        }
        if (changed) _settings.Save();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        if (!_settings.Data.OnboardingCompleted)
        {
            var welcome = new OnboardingWindow(_settings) { Owner = this };
            if (welcome.ShowDialog() != true) { Close(); return; }
            _settings.Save();
        }
        if (!_startEmpty)
            await CreateTabAsync(_startupUrl);

        if (!string.IsNullOrWhiteSpace(_manageAppId))
        {
            var manager = new AppsWindow(_settings, _manageAppId) { Owner = this };
            manager.Show();
        }

        if (!_siteAppMode)
            _ = CheckForYamaSearchUpdateAsync();
    }

    private sealed record YamaSearchUpdate(string? Version, string? Notes, string? PortableUrl, string? InstallerUrl);

    private async Task CheckForYamaSearchUpdateAsync()
    {
        try
        {
            using var manifestResponse = await UpdateClient.GetAsync(UpdateManifestUrl, HttpCompletionOption.ResponseContentRead);
            manifestResponse.EnsureSuccessStatusCode();
            var json = await manifestResponse.Content.ReadAsStringAsync();

            var update = JsonSerializer.Deserialize<YamaSearchUpdate>(
                json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            var current = typeof(MainWindow).Assembly.GetName().Version;
            if (update is null
                || !Version.TryParse(update.Version, out var available)
                || current is null
                || available <= current)
                return;

            var notes = string.IsNullOrWhiteSpace(update.Notes)
                ? $"Je dostupná nová verze YamaSearch {available}."
                : update.Notes!;

            var dialog = new UpdateWindow(current, available, notes, IsInstalledBuild()) { Owner = this };
            if (dialog.ShowDialog() != true || dialog.Choice == YamaSearchUpdateChoice.Later)
                return;

            if (dialog.Choice == YamaSearchUpdateChoice.Installer)
            {
                if (!TryGetTrustedUpdateUri(update.InstallerUrl, out var installerUri))
                {
                    MessageBox.Show("Adresa instalátoru aktualizace není platná.", "YamaSearch", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                await DownloadAndLaunchInstallerAsync(installerUri, available);
                return;
            }

            if (!TryGetTrustedUpdateUri(update.PortableUrl, out var portableUri))
            {
                MessageBox.Show("Adresa Portable aktualizace není platná.", "YamaSearch", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            await DownloadPortableAsync(portableUri, available);
        }
        catch (Exception exception)
        {
            StatusText.Text = "Kontrola aktualizace se nepodařila.";
            Debug.WriteLine("YamaSearch update check failed: " + exception);
        }
    }

    private static bool TryGetTrustedUpdateUri(string? raw, out Uri uri)
    {
        uri = null!;
        return !string.IsNullOrWhiteSpace(raw)
            && Uri.TryCreate(raw, UriKind.Absolute, out uri)
            && uri.Scheme == Uri.UriSchemeHttps
            && string.Equals(uri.Host, "updates.yamachat.eu", StringComparison.OrdinalIgnoreCase)
            && uri.AbsolutePath.StartsWith("/yamasearch/", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsInstalledBuild()
    {
        var installedRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Programs",
            "YamaSearch");

        var runningRoot = Path.GetFullPath(AppContext.BaseDirectory)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        installedRoot = Path.GetFullPath(installedRoot)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        return runningRoot.Equals(installedRoot, StringComparison.OrdinalIgnoreCase);
    }

    private async Task DownloadAndLaunchInstallerAsync(Uri uri, Version available)
    {
        var updateDir = Path.Combine(Path.GetTempPath(), "YamaSearch", "Updates");
        Directory.CreateDirectory(updateDir);
        var target = Path.Combine(updateDir, $"YamaSearch-Setup-{available}.exe");

        try
        {
            StatusText.Text = $"Stahuji aktualizaci YamaSearch {available}…";
            await DownloadUpdateFileAsync(uri, target);

            if (!File.Exists(target) || new FileInfo(target).Length < 100_000)
                throw new InvalidDataException("Stažený instalátor je neplatný nebo neúplný.");

            StatusText.Text = "Spouštím instalátor aktualizace…";
            Process.Start(new ProcessStartInfo(target)
            {
                UseShellExecute = true,
                Arguments = "/CLOSEAPPLICATIONS"
            });

            Application.Current.Shutdown();
        }
        catch (Exception exception)
        {
            MessageBox.Show(
                "Aktualizaci se nepodařilo stáhnout nebo spustit.\n\n" + exception.Message,
                "YamaSearch",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            StatusText.Text = "Aktualizace se nezdařila.";
        }
    }

    private async Task DownloadPortableAsync(Uri uri, Version available)
    {
        var downloads = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "Downloads");
        Directory.CreateDirectory(downloads);

        var target = Path.Combine(downloads, $"YamaSearch-Portable-{available}.zip");
        try
        {
            StatusText.Text = $"Stahuji Portable YamaSearch {available}…";
            await DownloadUpdateFileAsync(uri, target);

            if (!File.Exists(target) || new FileInfo(target).Length < 100_000)
                throw new InvalidDataException("Stažený Portable ZIP je neplatný nebo neúplný.");

            StatusText.Text = $"Portable YamaSearch {available} je stažený.";
            Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{target}\"")
            {
                UseShellExecute = true
            });

            MessageBox.Show(
                "Portable ZIP je stažený. Rozbal ho do nové složky a spusť YamaSearch.exe z této nové verze.\n\n" +
                "Pokud budeš dál spouštět starý Portable EXE, bude ti stará verze aktualizaci znovu nabízet.",
                "YamaSearch Portable aktualizace",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
        }
        catch (Exception exception)
        {
            MessageBox.Show(
                "Portable aktualizaci se nepodařilo stáhnout.\n\n" + exception.Message,
                "YamaSearch",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            StatusText.Text = "Stažení Portable aktualizace se nezdařilo.";
        }
    }

    private static async Task DownloadUpdateFileAsync(Uri uri, string targetPath)
    {
        var partialPath = targetPath + ".partial";
        if (File.Exists(partialPath)) File.Delete(partialPath);

        using var response = await UpdateClient.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();

        await using (var source = await response.Content.ReadAsStreamAsync())
        await using (var destination = new FileStream(partialPath, FileMode.Create, FileAccess.Write, FileShare.None))
            await source.CopyToAsync(destination);

        if (File.Exists(targetPath)) File.Delete(targetPath);
        File.Move(partialPath, targetPath);
    }

    private async Task<BrowserTab?> CreateTabAsync(string? address = null, bool deferNavigationToNewWindow = false)
    {
        if (_isClosing) return null;
        var tab = new BrowserTab();
        if (_isPrivateWindow)
        {
            tab.PrivateSession = GetPrivateWebSessionForNewTab();
            tab.PrivateSession.RetainTab();
        }
        CoreWebView2Environment? environment = null;
        _tabs.Add(tab);
        try
        {
            if (!IsTabCreationStillCurrent(tab)) return null;
            SelectTab(tab);
            StatusText.Text = "Spouštím webový engine…";
            environment = await GetWebViewEnvironmentAsync(tab);
            if (!IsTabCreationStillCurrent(tab)) return null;
            // A private session distinguishes an environment that was created but
            // never received a controller from a real Chromium process. This lets
            // a rapid window close clean the former immediately, while the latter
            // waits for BrowserProcessExited before its profile is removed.
            var privateSession = tab.PrivateSession;
            PrivateWebSession.ControllerInitialization? controllerInitialization = null;
            if (privateSession is not null)
            {
                controllerInitialization = privateSession.BeginControllerInitialization(environment);
                tab.PrivateInitialization = controllerInitialization;
            }
            Task initializeTask;
            try
            {
                initializeTask = tab.View.EnsureCoreWebView2Async(environment);
                if (privateSession is not null && controllerInitialization is not null)
                {
                    _ = initializeTask.ContinueWith(
                        completed =>
                        {
                            if (ReferenceEquals(tab.PrivateInitialization, controllerInitialization))
                                tab.PrivateInitialization = null;
                            privateSession.CompleteControllerInitialization(
                                controllerInitialization,
                                completed.IsCompletedSuccessfully || HasLiveWebViewProcess(environment));
                        },
                        CancellationToken.None,
                        TaskContinuationOptions.None,
                        TaskScheduler.FromCurrentSynchronizationContext());
                }
            }
            catch
            {
                if (privateSession is not null && controllerInitialization is not null)
                {
                    if (ReferenceEquals(tab.PrivateInitialization, controllerInitialization))
                        tab.PrivateInitialization = null;
                    privateSession.CompleteControllerInitialization(controllerInitialization, HasLiveWebViewProcess(environment));
                }
                throw;
            }
            if (await Task.WhenAny(initializeTask, Task.Delay(TimeSpan.FromSeconds(12))) != initializeTask)
                throw new TimeoutException("WebView2 Runtime se nespustil během 12 sekund.");
            await initializeTask;
            if (!IsTabCreationStillCurrent(tab)) return null;
            await ConfigureWebViewAsync(tab);
            if (!IsTabCreationStillCurrent(tab)) return null;
            SelectTab(tab);
            _ = Dispatcher.BeginInvoke(() => TabsScroller.ScrollToRightEnd());
            if (!deferNavigationToNewWindow)
                await NavigateAsync(tab, address ?? _settings.Data.HomePage);
            return tab;
        }
        catch (Exception exception)
        {
            // A failed navigation or tab configuration does not mean the shared
            // environment is unhealthy. Invalidating it here could create a second
            // browser process over the same normal profile while other windows are
            // still using the first one. Creation failures and BrowserProcessExited
            // already clear the cached environment in their dedicated paths.
            var wasTracked = _tabs.Remove(tab);
            if (wasTracked) DisposeBrowserTab(tab);
            if (_isClosing || !wasTracked) return null;
            StatusText.Text = "Novou kartu se nepodařilo otevřít: " + exception.Message;
            MessageBox.Show(
                "YamaSearch nemohl otevřít novou kartu.\n\n" + exception.Message,
                "YamaSearch",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            return null;
        }
    }

    private bool IsTabCreationStillCurrent(BrowserTab tab)
        => !_isClosing && _tabs.Contains(tab);

    private static bool HasLiveWebViewProcess(CoreWebView2Environment environment)
    {
        try { return environment.GetProcessInfos().Any(); }
        // A failed process query is not proof that Chromium has already stopped.
        // The session will wait for BrowserProcessExited rather than delete a live
        // profile concurrently with a process that could still hold it.
        catch { return true; }
    }

    private async Task ConfigureWebViewAsync(BrowserTab tab)
    {
        tab.Owner = this;
        var core = tab.View.CoreWebView2;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsReputationCheckingRequired = _settings.Data.EnableSmartScreen;
        core.Settings.IsPasswordAutosaveEnabled = !_isPrivateWindow && _settings.Data.OfferPasswordSave;
        core.Settings.IsGeneralAutofillEnabled = !_isPrivateWindow && _settings.Data.EnableGeneralAutofill;
        core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += (_, e) => tab.Owner?.BlockRequest(tab, e);
        await RefreshYamaBlockBootstrapAsync(tab);
        await InstallTabTitleWatcherAsync(tab);
        await InstallMediaUsageWatcherAsync(tab);
        core.WebMessageReceived += (_, e) => tab.Owner?.HandleNewTabMessage(tab, e);
        core.NavigationStarting += (_, e) =>
        {
            var owner = tab.Owner;
            if (owner is null) return;
            owner.ResetTabPageState(tab);
            owner.CancelPendingSitePermissionRequest(tab);
            tab.NavigationGeneration++;
            tab.BlockedCount = 0;
            if (owner._active == tab) owner.BlockedText.Text = "YamaBlock · 0 blokováno";

            if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var destination) && destination.Scheme is "http" or "https")
            {
                tab.IsYamaNewTab = false;
                if (owner._active == tab) owner.SetAddressText(e.Uri);
            }
            if (owner._active == tab) owner.StatusText.Text = "Načítání…";
            if (owner._active == tab)
            {
                owner.UpdateNavigationControls();
                owner.UpdateSiteInformationButton(tab);
                owner.RefreshOpenSiteInformation(tab);
            }
        };
        core.NavigationCompleted += async (_, e) =>
        {
            var owner = tab.Owner;
            if (owner is null) return;
            if (owner._active == tab) owner.StatusText.Text = e.IsSuccess ? "Hotovo" : "Stránku se nepodařilo načíst";
            owner.UpdateTabTitle(tab);
            if (e.IsSuccess && Uri.TryCreate(core.Source, UriKind.Absolute, out var page) && page.Scheme is "http" or "https")
            {
                if (!owner._isPrivateWindow)
                    owner.AddHistory(core.Source, core.DocumentTitle, core.FaviconUri);
                await owner.ApplyYamaBlockPageRulesAsync(tab);
                await owner.SyncPermissionActivitiesFromProfileAsync(tab);
            }
            if (owner._active == tab) owner.UpdateNavigationControls();
        };
        core.DocumentTitleChanged += (_, _) => tab.Owner?.UpdateTabTitle(tab);
        core.FaviconChanged += (_, _) => tab.Owner?.UpdateFavicon(tab);
        core.NotificationReceived += (_, e) => tab.Owner?.HandleWebNotification(tab, e);
        tab.View.ZoomFactorChanged += (_, _) => tab.Owner?.Dispatcher.BeginInvoke(() =>
        {
            var owner = tab.Owner;
            if (owner?._active != tab)
                return;

            owner.UpdateZoomPopup();
            owner.ZoomPopup.IsOpen = true;
        });

        tab.IsPlayingAudio = core.IsDocumentPlayingAudio;
        tab.IsMuted = core.IsMuted;

        core.IsDocumentPlayingAudioChanged += (_, _) =>
        {
            tab.Owner?.Dispatcher.Invoke(() =>
            {
                var owner = tab.Owner;
                if (owner is null) return;
                tab.IsPlayingAudio = core.IsDocumentPlayingAudio;
                owner.RenderTabs();
            });
        };

        core.IsMutedChanged += (_, _) =>
        {
            tab.Owner?.Dispatcher.Invoke(() =>
            {
                var owner = tab.Owner;
                if (owner is null) return;
                tab.IsMuted = core.IsMuted;
                owner.RenderTabs();
            });
        };

        core.ContainsFullScreenElementChanged += (_, _) => tab.Owner?.Dispatcher.Invoke(() => tab.Owner?.SetVideoFullScreen(core.ContainsFullScreenElement));
        core.SourceChanged += (_, e) =>
        {
            var owner = tab.Owner;
            if (e.IsNewDocument) tab.PermissionActivities.Clear();
            owner?.UpdateTabTitle(tab);
            if (owner is not null)
                _ = owner.SyncPermissionActivitiesFromProfileAsync(tab);
            if (owner?._active == tab)
            {
                owner.SetAddressText(tab.IsYamaNewTab ? "" : core.Source);
                owner.UpdateNavigationControls();
                owner.UpdateSiteInformationButton(tab);
                owner.RefreshOpenSiteInformation(tab);
            }
        };
        core.HistoryChanged += (_, _) => { var owner = tab.Owner; if (owner?._active == tab) owner.Dispatcher.Invoke(owner.UpdateNavigationControls); };
        core.PermissionRequested += (_, e) => tab.Owner?.HandlePermissionRequest(tab, e);
        core.NewWindowRequested += async (_, e) =>
        {
            var owner = tab.Owner;
            if (owner is null)
            {
                e.Handled = true;
                return;
            }
            await owner.HandleNewWindowRequestedAsync(e);
        };
        core.WindowCloseRequested += (_, _) => tab.Owner?.Dispatcher.BeginInvoke(() =>
        {
            var owner = tab.Owner;
            if (owner is null || !owner._tabs.Contains(tab)) return;
            owner.CloseTab(tab);
        });
        core.DownloadStarting += (_, e) => tab.Owner?.HandleDownloadStarting(e);
    }

    private async Task HandleNewWindowRequestedAsync(CoreWebView2NewWindowRequestedEventArgs args)
    {
        var deferral = args.GetDeferral();
        try
        {
            var popupTab = await CreateTabAsync(deferNavigationToNewWindow: true);
            if (popupTab?.View.CoreWebView2 is { } popupCore)
            {
                // Hand the real target WebView2 back to Chromium. OAuth popups then
                // retain window.opener/postMessage and can close themselves normally.
                args.NewWindow = popupCore;
                args.Handled = true;
                return;
            }

            args.Handled = true;
            if (!string.IsNullOrWhiteSpace(args.Uri))
                await CreateTabAsync(args.Uri);
        }
        finally
        {
            deferral.Complete();
        }
    }

    private static async Task InstallTabTitleWatcherAsync(BrowserTab tab)
    {
        // WebView2's DocumentTitleChanged is retained as the native fast path.
        // This observer covers SPA pages which change <title> from JavaScript while
        // their WebView is not the visual child of the active browser window.
        const string script = """
            (() => {
              let lastTitle;
              const publish = () => {
                const title = document.title || '';
                if (title === lastTitle) return;
                lastTitle = title;
                try { chrome.webview.postMessage(JSON.stringify({ action: 'tabTitleChanged', title })); } catch { }
              };
              new MutationObserver(publish).observe(document, { subtree: true, childList: true, characterData: true });
              publish();
            })();
            """;

        await tab.View.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(script);
    }

    private static async Task InstallMediaUsageWatcherAsync(BrowserTab tab)
    {
        // WebView2 exposes permission decisions, but not whether a granted camera
        // or microphone stream is currently alive. Observe getUserMedia without
        // changing its result so the lock panel can show Edge-like live usage.
        const string scriptTemplate = """
            (() => {
              if (window.__yamaSearchMediaObserverV1) return;
              window.__yamaSearchMediaObserverV1 = true;

              const bridgeToken = __YAMA_BRIDGE_TOKEN__;
              const marker = '__yamaSearchMediaUsageV1';
              const sendToHost = payload => {
                try {
                  payload.action = 'siteMediaUsage';
                  payload.bridgeToken = bridgeToken;
                  payload.origin = location.origin || '';
                  if (window === window.top) {
                    payload.topOrigin = location.origin || '';
                    chrome.webview.postMessage(JSON.stringify(payload));
                  } else {
                    window.top.postMessage({ marker, bridgeToken, payload }, '*');
                  }
                } catch { }
              };

              if (window === window.top) {
                window.addEventListener('message', event => {
                  try {
                    const value = event.data;
                    if (!value || value.marker !== marker || value.bridgeToken !== bridgeToken || !value.payload) return;
                    value.payload.topOrigin = location.origin || '';
                    chrome.webview.postMessage(JSON.stringify(value.payload));
                  } catch { }
                });
              }

              const mediaDevices = navigator.mediaDevices;
              if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') return;
              const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
              mediaDevices.getUserMedia = async function(constraints) {
                const requestedKinds = [];
                if (constraints && constraints.audio) requestedKinds.push('microphone');
                if (constraints && constraints.video) requestedKinds.push('camera');
                const requestId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
                for (const mediaKind of requestedKinds)
                  sendToHost({ phase: 'request', requestId, mediaKind });
                try {
                  const stream = await originalGetUserMedia(constraints);
                  const tracks = typeof stream.getTracks === 'function' ? stream.getTracks() : [];
                  for (const track of tracks) {
                    const mediaKind = track.kind === 'audio' ? 'microphone' : track.kind === 'video' ? 'camera' : '';
                    if (!mediaKind) continue;
                    const trackId = `${requestId}:${track.id || Math.random()}`;
                    sendToHost({ phase: 'active', requestId, trackId, mediaKind });
                    let endedSent = false;
                    const ended = () => {
                      if (endedSent) return;
                      endedSent = true;
                      sendToHost({ phase: 'ended', requestId, trackId, mediaKind });
                    };
                    if (track.readyState === 'ended') ended();
                    else {
                      track.addEventListener('ended', ended, { once: true });
                      try {
                        const originalStop = track.stop.bind(track);
                        track.stop = function() {
                          try { return originalStop(); }
                          finally { ended(); }
                        };
                      } catch { }
                    }
                  }
                  return stream;
                } catch (error) {
                  const errorName = error && typeof error.name === 'string' ? error.name : 'Error';
                  for (const mediaKind of requestedKinds)
                    sendToHost({ phase: 'error', requestId, mediaKind, errorName });
                  throw error;
                }
              };
            })();
            """;

        var bridgeToken = JsonSerializer.Serialize(tab.MediaUsageBridgeToken);
        await tab.View.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
            scriptTemplate.Replace("__YAMA_BRIDGE_TOKEN__", bridgeToken, StringComparison.Ordinal));
    }
    private PrivateWebSession GetPrivateWebSessionForNewTab()
    {
        if (_privateWebSession is null || !_privateWebSession.CanCreateTabs)
            _privateWebSession = new PrivateWebSession();
        return _privateWebSession;
    }

    private void ReconcilePrivateSessionForLocalTabs()
    {
        if (!_isPrivateWindow) return;
        if (_privateWebSession is not null
            && _tabs.Any(tab => ReferenceEquals(tab.PrivateSession, _privateWebSession)))
            return;

        _privateWebSession = _tabs
            .Select(tab => tab.PrivateSession)
            .FirstOrDefault(session => session is not null)
            ?? new PrivateWebSession();
    }

    private Task<CoreWebView2Environment> GetWebViewEnvironmentAsync(BrowserTab tab)
    {
        if (_isPrivateWindow)
        {
            var session = tab.PrivateSession ?? throw new InvalidOperationException("K anonymní kartě chybí její relace.");
            var environmentTask = session.GetOrCreateEnvironmentTask(() => CreateWebViewEnvironmentAsync(session));
            return AwaitWebViewEnvironmentAsync(environmentTask, session);
        }

        Task<CoreWebView2Environment> normalEnvironmentTask;
        lock (WebViewEnvironmentLock)
            normalEnvironmentTask = _normalWebViewEnvironmentTask ??= CreateWebViewEnvironmentAsync();
        return AwaitWebViewEnvironmentAsync(normalEnvironmentTask);
    }

    private async Task<CoreWebView2Environment> AwaitWebViewEnvironmentAsync(
        Task<CoreWebView2Environment> environmentTask,
        PrivateWebSession? privateSession = null)
    {
        try { return await environmentTask; }
        catch
        {
            if (privateSession is not null)
                privateSession.InvalidateEnvironmentTask(environmentTask);
            else
            {
                lock (WebViewEnvironmentLock)
                {
                    if (ReferenceEquals(_normalWebViewEnvironmentTask, environmentTask))
                        _normalWebViewEnvironmentTask = null;
                }
            }
            throw;
        }
    }

    private async Task<CoreWebView2Environment> CreateWebViewEnvironmentAsync(PrivateWebSession? privateSession = null)
    {
        var options = new CoreWebView2EnvironmentOptions();
        if (!_settings.Data.HardwareAccelerationEnabled)
            options.AdditionalBrowserArguments = "--disable-gpu --disable-gpu-compositing";

        var dataFolder = privateSession?.DataFolder ?? _webDataFolder;
        if (string.IsNullOrWhiteSpace(dataFolder))
            throw new InvalidOperationException("Pro webový engine se nepodařilo připravit profil.");

        try
        {
            Directory.CreateDirectory(dataFolder);
            var environment = await CoreWebView2Environment.CreateAsync(null, dataFolder, options);
            TrackWebViewEnvironmentLifetime(environment, privateSession);
            return environment;
        }
        catch (Exception exception) when (exception is ArgumentException or System.Runtime.InteropServices.COMException or IOException or UnauthorizedAccessException)
        {
            var profileName = privateSession is not null ? "anonymní profil" : "trvalý profil YamaSearch";
            throw new InvalidOperationException($"Nepodařilo se otevřít {profileName}. Pro ochranu vašich dat nebyl použit dočasný náhradní profil.", exception);
        }
    }

    private static void TrackWebViewEnvironmentLifetime(CoreWebView2Environment environment, PrivateWebSession? privateSession)
    {
        if (privateSession is not null)
        {
            environment.BrowserProcessExited += (_, _) => privateSession.BrowserProcessExited(environment);
            return;
        }

        environment.BrowserProcessExited += NormalWebViewEnvironment_BrowserProcessExited;
    }

    private static void NormalWebViewEnvironment_BrowserProcessExited(object? sender, CoreWebView2BrowserProcessExitedEventArgs e)
    {
        if (sender is not CoreWebView2Environment environment) return;
        lock (WebViewEnvironmentLock)
        {
            if (_normalWebViewEnvironmentTask is { IsCompletedSuccessfully: true }
                && ReferenceEquals(_normalWebViewEnvironmentTask.Result, environment))
                _normalWebViewEnvironmentTask = null;
        }
    }


    private void BlockRequest(BrowserTab tab, CoreWebView2WebResourceRequestedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(e.Request.Uri)
            || !Uri.TryCreate(e.Request.Uri, UriKind.Absolute, out var uri))
            return;

        var pageHost = GetPageHost(tab);
        var youtubePage = IsYouTubeHost(pageHost);
        var relevantYoutubeRequest = youtubePage && IsYouTubeDiagnosticRequest(uri);

        if (_settings.Data.BlockMode == BlockMode.Off)
        {
            if (relevantYoutubeRequest)
                YamaBlockDiagnostics.Add("PROŠLO", "Síť / YamaBlock vypnutý", ShortRequest(uri));
            return;
        }

        if (!string.IsNullOrWhiteSpace(pageHost) && IsWhitelisted(pageHost))
        {
            if (relevantYoutubeRequest)
                YamaBlockDiagnostics.Add("PROŠLO", "Síť / výjimka webu", ShortRequest(uri));
            return;
        }

        var hostIsAd = HostMatchesAny(uri.Host, _adHosts);
        var hostIsTracker = _settings.Data.EnableTrackerBlocking && HostMatchesAny(uri.Host, _trackerHosts);

        // First-party YouTube playback/stat traffic is intentionally not cut off. Modern
        // blockers get better results by pruning ad metadata from player JSON responses
        // than by forcing the player into retries/timeouts.
        var youtubePlaybackInfrastructure = youtubePage && IsYouTubePlaybackInfrastructure(uri.Host);
        var strictUrlMatch = _settings.Data.BlockMode == BlockMode.Strict
            && !youtubePlaybackInfrastructure
            && StrictUrlTokens.Any(token => uri.PathAndQuery.Contains(token, StringComparison.OrdinalIgnoreCase));

        var youtubeThirdPartyAd = _settings.Data.EnableYouTubeAdBlock
            && youtubePage
            && (uri.Host.Equals("googleads.g.doubleclick.net", StringComparison.OrdinalIgnoreCase)
                || uri.Host.Equals("static.doubleclick.net", StringComparison.OrdinalIgnoreCase)
                || uri.Host.EndsWith(".googlesyndication.com", StringComparison.OrdinalIgnoreCase));

        if (!hostIsAd && !hostIsTracker && !strictUrlMatch && !youtubeThirdPartyAd)
        {
            if (relevantYoutubeRequest)
                YamaBlockDiagnostics.Add("PROŠLO", "Síť / player", ShortRequest(uri));
            return;
        }

        var reason = youtubeThirdPartyAd || hostIsAd
            ? "reklamní doména"
            : hostIsTracker
                ? "tracker"
                : "přísné URL pravidlo";

        e.Response = tab.View.CoreWebView2.Environment.CreateWebResourceResponse(
            null,
            204,
            "Blocked by YamaBlock",
            "Cache-Control: no-store");

        YamaBlockDiagnostics.Add("BLOKOVÁNO", $"Síť / {reason}", ShortRequest(uri));
        tab.BlockedCount++;
        if (_active == tab)
            BlockedText.Text = $"YamaBlock · {tab.BlockedCount} blokováno";
    }

    private static bool IsYouTubePlaybackInfrastructure(string host)
        => IsYouTubeHost(host)
           || host.EndsWith(".googlevideo.com", StringComparison.OrdinalIgnoreCase)
           || host.Equals("googlevideo.com", StringComparison.OrdinalIgnoreCase)
           || host.EndsWith(".ytimg.com", StringComparison.OrdinalIgnoreCase)
           || host.Equals("ytimg.com", StringComparison.OrdinalIgnoreCase);

    private static bool IsYouTubeDiagnosticRequest(Uri uri)
        => uri.AbsolutePath.Contains("/youtubei/v1/player", StringComparison.OrdinalIgnoreCase)
           || uri.AbsolutePath.EndsWith("/player", StringComparison.OrdinalIgnoreCase)
           || uri.AbsolutePath.Contains("/pagead/", StringComparison.OrdinalIgnoreCase)
           || uri.AbsolutePath.Contains("/get_midroll_info", StringComparison.OrdinalIgnoreCase)
           || uri.Host.Contains("doubleclick", StringComparison.OrdinalIgnoreCase)
           || uri.Host.Contains("googlesyndication", StringComparison.OrdinalIgnoreCase);

    private static string ShortRequest(Uri uri)
    {
        var path = uri.AbsolutePath;
        if (path.Length > 110) path = path[..107] + "…";
        return uri.Host + path;
    }

    private static bool HostMatchesAny(string host, IEnumerable<string> rules)
        => rules.Any(rule =>
            host.Equals(rule, StringComparison.OrdinalIgnoreCase)
            || host.EndsWith("." + rule, StringComparison.OrdinalIgnoreCase));

    private string GetPageHost(BrowserTab tab)
    {
        var source = tab.View.CoreWebView2?.Source;
        return Uri.TryCreate(source, UriKind.Absolute, out var page) ? page.Host : "";
    }

    private bool IsWhitelisted(string host)
        => _settings.Data.Whitelist.Any(x =>
            host.Equals(x, StringComparison.OrdinalIgnoreCase)
            || host.EndsWith("." + x, StringComparison.OrdinalIgnoreCase));

    private static bool IsYouTubeHost(string? host)
        => !string.IsNullOrWhiteSpace(host)
           && (host.Equals("youtube.com", StringComparison.OrdinalIgnoreCase)
               || host.EndsWith(".youtube.com", StringComparison.OrdinalIgnoreCase));

    private async Task ApplyYamaBlockPageRulesAsync(BrowserTab tab)
    {
        if (tab.View.CoreWebView2 == null) return;

        var pageHost = GetPageHost(tab);
        var enabled = _settings.Data.BlockMode != BlockMode.Off
            && !string.IsNullOrWhiteSpace(pageHost)
            && !IsWhitelisted(pageHost);

        var config = new
        {
            enabled,
            youtube = enabled && _settings.Data.EnableYouTubeAdBlock && IsYouTubeHost(pageHost),
            cosmetic = enabled && _settings.Data.EnableCosmeticBlocking,
            strict = enabled && _settings.Data.BlockMode == BlockMode.Strict,
            whitelist = _settings.Data.Whitelist.ToArray()
        };

        try
        {
            var json = JsonSerializer.Serialize(config);
            await tab.View.CoreWebView2.ExecuteScriptAsync(
                $"window.__yamaBlockApply && window.__yamaBlockApply({json});");
        }
        catch (Exception error)
        {
            Debug.WriteLine("YamaBlock page rules failed: " + error.Message);
        }
    }

    private async Task ApplyYamaBlockToAllTabsAsync()
    {
        foreach (var tab in _tabs.Where(x => x.View.CoreWebView2 != null).ToList())
        {
            await RefreshYamaBlockBootstrapAsync(tab);
            await ApplyYamaBlockPageRulesAsync(tab);
        }
    }

    private async Task RefreshYamaBlockBootstrapAsync(BrowserTab tab)
    {
        var core = tab.View.CoreWebView2;
        if (core == null) return;

        if (!string.IsNullOrWhiteSpace(tab.YamaBlockScriptId))
        {
            try { core.RemoveScriptToExecuteOnDocumentCreated(tab.YamaBlockScriptId); }
            catch { }
        }

        tab.YamaBlockScriptId = await core.AddScriptToExecuteOnDocumentCreatedAsync(CreateYamaBlockPageScript());
    }

    private string CreateYamaBlockPageScript()
    {
        var initial = JsonSerializer.Serialize(new
        {
            enabled = _settings.Data.BlockMode != BlockMode.Off,
            youtube = _settings.Data.EnableYouTubeAdBlock,
            cosmetic = _settings.Data.EnableCosmeticBlocking,
            strict = _settings.Data.BlockMode == BlockMode.Strict,
            whitelist = _settings.Data.Whitelist.ToArray()
        });

        return YamaBlockPageScript.Replace("__YAMA_INITIAL_CONFIG__", initial, StringComparison.Ordinal);
    }

    private const string YamaBlockPageScript = """
        (() => {
          if (window.__yamaBlockInstalled) return;
          window.__yamaBlockInstalled = true;

          let config = Object.assign(
            { enabled: false, youtube: false, cosmetic: false, strict: false, whitelist: [] },
            __YAMA_INITIAL_CONFIG__
          );
          let scheduled = false;
          let timer = 0;
          const styleId = 'yamablock-cosmetic-style';

          const isWhitelisted = () => {
            const host = location.hostname.toLowerCase();
            return Array.isArray(config.whitelist) && config.whitelist.some(raw => {
              const rule = String(raw || '').toLowerCase();
              return rule && (host === rule || host.endsWith('.' + rule));
            });
          };

          const active = () => !!config.enabled && !isWhitelisted();
          const youtubeActive = () =>
            active() && !!config.youtube && location.hostname.endsWith('youtube.com');

          const postLog = (status, category, detail) => {
            try {
              window.chrome?.webview?.postMessage(JSON.stringify({
                action: 'yamaBlockLog',
                status,
                category,
                detail: String(detail || '').slice(0, 260)
              }));
            } catch {}
          };

          const compactUrl = (raw) => {
            try {
              const u = new URL(raw, location.href);
              return u.host + u.pathname;
            } catch {
              return String(raw || '').slice(0, 180);
            }
          };

          const pruneAdFields = (value) => {
            if (!value || typeof value !== 'object') return 0;
            let removed = 0;

            const pruneObject = (obj) => {
              if (!obj || typeof obj !== 'object') return;
              for (const key of ['adPlacements', 'adSlots', 'playerAds']) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                  try {
                    delete obj[key];
                    removed++;
                  } catch {}
                }
              }
            };

            pruneObject(value);
            pruneObject(value.playerResponse);

            if (Array.isArray(value)) {
              for (const item of value) {
                if (item && typeof item === 'object') {
                  pruneObject(item);
                  pruneObject(item.playerResponse);
                }
              }
            }

            return removed;
          };

          const isPlayerApi = (raw) => {
            try {
              const u = new URL(raw, location.href);
              if (!u.hostname.endsWith('youtube.com')) return false;
              return u.pathname.includes('/youtubei/v1/player')
                || /\/player$/.test(u.pathname)
                || u.pathname.includes('/get_watch');
            } catch {
              return false;
            }
          };

          // AdGuard-style idea: let the YouTube player request finish normally, then remove
          // only ad metadata from its JSON. This avoids the retries/blank player caused by
          // blocking YouTube's own playback endpoints.
          const nativeFetch = window.fetch?.bind(window);
          if (nativeFetch) {
            window.fetch = async (...args) => {
              const response = await nativeFetch(...args);
              const rawUrl = typeof args[0] === 'string'
                ? args[0]
                : (args[0]?.url || response.url || '');

              if (!youtubeActive() || !isPlayerApi(rawUrl))
                return response;

              try {
                const text = await response.clone().text();
                if (!text || (text[0] !== '{' && text[0] !== '[')) {
                  postLog('PROŠLO', 'YouTube player JSON', compactUrl(rawUrl));
                  return response;
                }

                const data = JSON.parse(text);
                const removed = pruneAdFields(data);
                if (removed <= 0) {
                  postLog('PROŠLO', 'YouTube player JSON', compactUrl(rawUrl));
                  return response;
                }

                const headers = new Headers(response.headers);
                headers.delete('content-length');
                headers.delete('content-encoding');

                postLog('ODSTRANĚNO', 'YouTube player JSON',
                  removed + ' reklamních polí · ' + compactUrl(rawUrl));

                return new Response(JSON.stringify(data), {
                  status: response.status,
                  statusText: response.statusText,
                  headers
                });
              } catch {
                postLog('PROŠLO', 'YouTube player JSON / bez zásahu', compactUrl(rawUrl));
                return response;
              }
            };
          }

          // Initial player data may be embedded directly into the page before the normal
          // player API fetch. Trap that object early and prune the same ad metadata.
          try {
            let initialPlayerResponse;
            Object.defineProperty(window, 'ytInitialPlayerResponse', {
              configurable: true,
              get() { return initialPlayerResponse; },
              set(value) {
                if (youtubeActive()) {
                  const removed = pruneAdFields(value);
                  if (removed > 0)
                    postLog('ODSTRANĚNO', 'YouTube initial player',
                      removed + ' reklamních polí');
                }
                initialPlayerResponse = value;
              }
            });
          } catch {}

          const pruneLegacyPlayerConfig = () => {
            if (!youtubeActive()) return;
            try {
              const args = window.ytplayer?.config?.args;
              const raw = args?.player_response;
              if (typeof raw !== 'string' || !raw.startsWith('{')) return;
              const data = JSON.parse(raw);
              const removed = pruneAdFields(data);
              if (removed > 0) {
                args.player_response = JSON.stringify(data);
                postLog('ODSTRANĚNO', 'YouTube legacy player',
                  removed + ' reklamních polí');
              }
            } catch {}
          };

          const ensureStyle = () => {
            let style = document.getElementById(styleId);
            if (!active() || (!config.cosmetic && !config.youtube)) {
              if (style) style.remove();
              return;
            }

            if (!style) {
              style = document.createElement('style');
              style.id = styleId;
              (document.head || document.documentElement).appendChild(style);
            }

            const rules = [];
            if (config.cosmetic) {
              rules.push(
                'ins.adsbygoogle',
                '[id^="google_ads_"]',
                'iframe[src*="doubleclick.net"]',
                'iframe[src*="googlesyndication.com"]',
                '[data-ad-client]'
              );
            }

            if (youtubeActive()) {
              rules.push(
                '#player-ads',
                '.ytp-ad-overlay-container',
                '.ytp-ad-text-overlay',
                'ytd-display-ad-renderer',
                'ytd-ad-slot-renderer',
                'ytd-promoted-sparkles-web-renderer',
                'ytd-promoted-video-renderer',
                'ytd-companion-slot-renderer',
                'ytd-in-feed-ad-layout-renderer'
              );
            }

            style.textContent = rules.length
              ? rules.join(',') + '{display:none!important;visibility:hidden!important;}'
              : '';
          };

          const clickSkip = () => {
            if (!youtubeActive()) return false;
            const selectors = [
              '.ytp-skip-ad-button',
              '.ytp-ad-skip-button',
              '.ytp-ad-skip-button-modern',
              'button[class*="skip-ad"]'
            ];

            for (const selector of selectors) {
              const button = document.querySelector(selector);
              if (button instanceof HTMLElement && button.offsetParent !== null) {
                try {
                  button.click();
                  postLog('ODSTRANĚNO', 'YouTube přehrávač', 'Použito tlačítko Přeskočit reklamu');
                } catch {}
                return true;
              }
            }
            return false;
          };

          const run = () => {
            scheduled = false;
            ensureStyle();
            pruneLegacyPlayerConfig();
            clickSkip();
          };

          const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            clearTimeout(timer);
            timer = setTimeout(run, 140);
          };

          const observer = new MutationObserver(schedule);
          const start = () => {
            if (document.documentElement) {
              observer.observe(document.documentElement, { childList: true, subtree: true });
            }
            schedule();
          };

          if (document.readyState === 'loading')
            document.addEventListener('DOMContentLoaded', start, { once: true });
          else
            start();

          window.addEventListener('yt-navigate-finish', schedule);
          window.__yamaBlockApply = (next) => {
            config = Object.assign({}, config, next || {});
            schedule();
          };

          setInterval(() => {
            if (youtubeActive()) clickSkip();
          }, 2500);
        })();
        """;
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
        // The address-bar prompt is deliberately tied to the tab that caused it.
        // Letting it survive a tab switch would make it appear next to another
        // page's lock and could lead the user to allow a permission for the wrong
        // web. The pending WebView2 deferral is completed without persistence.
        if (!ReferenceEquals(_active, tab) && _active is not null)
            CancelPendingSitePermissionRequest(_active);
        _siteInfoRenderVersion++;
        SiteInfoPopup.IsOpen = false;
        // Selecting the tab is the acknowledgement. Keep any count supplied by
        // the page in its title, but remove YamaSearch's unread marker.
        tab.HasWebNotification = false;
        _active = tab; BrowserHost.Children.Clear(); BrowserHost.Children.Add(tab.View);
        SetAddressText(tab.IsYamaNewTab ? "" : tab.View.CoreWebView2?.Source ?? "");
        UpdateSiteInformationButton(tab);
        _ = SyncPermissionActivitiesFromProfileAsync(tab);
        RenderTabs(); UpdateNavigationControls(); UpdateZoomPopup(); BlockedText.Text = $"YamaBlock · {tab.BlockedCount} blokováno";
    }

    private void UpdateSiteInformationButton(BrowserTab tab)
    {
        var source = tab.View.CoreWebView2?.Source;
        var pending = tab.PermissionActivities
            .Where(activity => activity.IsPending || activity.IsMediaRequestPending)
            .OrderByDescending(activity => activity.UpdatedAt)
            .FirstOrDefault();
        var activeMedia = tab.PermissionActivities
            .Where(activity => activity.IsMediaInUse)
            .OrderByDescending(activity => activity.UpdatedAt)
            .FirstOrDefault();
        var decision = tab.PermissionActivities
            .Where(activity => !activity.IsPending
                && (activity.State is CoreWebView2PermissionState.Allow or CoreWebView2PermissionState.Deny))
            .OrderByDescending(activity => activity.UpdatedAt)
            .FirstOrDefault();
        if (Uri.TryCreate(source, UriKind.Absolute, out var page) && page.Scheme is "http" or "https")
        {
            var baseIcon = page.Scheme == Uri.UriSchemeHttps ? "🔒" : "⚠";
            if (pending is not null)
            {
                SitePermissionsButton.Content = baseIcon + " •";
                SitePermissionsButton.ToolTip = $"{PermissionLabels.For(pending.Kind)} čeká na vaše rozhodnutí";
            }
            else if (activeMedia is not null)
            {
                var mediaIcon = activeMedia.Kind == CoreWebView2PermissionKind.Microphone ? " 🎙" : " 📷";
                SitePermissionsButton.Content = baseIcon + mediaIcon;
                SitePermissionsButton.ToolTip = $"Web právě používá {PermissionLabels.For(activeMedia.Kind)}";
            }
            else if (decision is not null)
            {
                SitePermissionsButton.Content = baseIcon + (decision.State == CoreWebView2PermissionState.Allow ? " ✓" : " ×");
                var state = decision.State == CoreWebView2PermissionState.Allow ? "povoleno" : "blokováno";
                var scope = decision.IsSessionOnly ? " v tomto anonymním okně" : " pro tento web";
                SitePermissionsButton.ToolTip = $"{PermissionLabels.For(decision.Kind)} je {state}{scope}";
            }
            else
            {
                SitePermissionsButton.Content = baseIcon;
                SitePermissionsButton.ToolTip = page.Scheme == Uri.UriSchemeHttps
                ? "Zabezpečené připojení a oprávnění webu"
                : "Nezabezpečené připojení a oprávnění webu";
            }
        }
        else
        {
            SitePermissionsButton.Content = "ⓘ";
            SitePermissionsButton.ToolTip = "Informace o aktuální stránce";
        }
    }

    private void ZoomButton_Click(object sender, RoutedEventArgs e)
    {
        UpdateZoomPopup();
        ZoomPopup.IsOpen = !ZoomPopup.IsOpen;
    }

    private void ZoomIn_Click(object sender, RoutedEventArgs e) => ChangeActiveZoom(0.1);

    private void ZoomOut_Click(object sender, RoutedEventArgs e) => ChangeActiveZoom(-0.1);

    private void ZoomReset_Click(object sender, RoutedEventArgs e) => SetActiveZoom(1.0);

    private void ChangeActiveZoom(double change)
    {
        var view = _active?.View;
        if (view is null)
            return;

        SetActiveZoom(view.ZoomFactor + change);
    }

    private void SetActiveZoom(double zoom)
    {
        var view = _active?.View;
        if (view is null)
            return;

        view.ZoomFactor = Math.Clamp(zoom, 0.25, 5.0);
        UpdateZoomPopup();
        ZoomPopup.IsOpen = true;
    }

    private void UpdateZoomPopup()
    {
        var zoom = _active?.View.ZoomFactor ?? 1.0;
        ZoomPercentText.Text = $"{Math.Round(zoom * 100):0} %";
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
            var faviconHost = new Grid
            {
                Width = 16,
                Height = 16,
                Margin = new Thickness(0, 0, iconOnly ? 0 : 7, 0)
            };
            faviconHost.Children.Add(new Image
            {
                Source = tab.Favicon ?? new BitmapImage(new Uri("pack://application:,,,/Assets/YamaSearch-symbol-64.png")),
                Width = 16,
                Height = 16
            });
            if (tab.HasWebNotification)
            {
                faviconHost.Children.Add(new System.Windows.Shapes.Ellipse
                {
                    Width = 6,
                    Height = 6,
                    Fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#F05270")),
                    Stroke = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#101B2B")),
                    StrokeThickness = 1,
                    HorizontalAlignment = HorizontalAlignment.Right,
                    VerticalAlignment = VerticalAlignment.Top,
                    Margin = new Thickness(0, -2, -2, 0),
                    ToolTip = "Nové upozornění"
                });
            }
            header.Children.Add(faviconHost);

            var showAudioButton = !compact && (tab.IsPlayingAudio || tab.IsMuted);

            if (!iconOnly)
            {
                header.Children.Add(new TextBlock
                {
                    Text = tab.Title,
                    Width = tabWidth < 120 ? 55 : showAudioButton ? 92 : 125,
                    TextTrimming = TextTrimming.CharacterEllipsis,
                    VerticalAlignment = VerticalAlignment.Center
                });
            }

            if (!compact)
            {
                if (showAudioButton)
                {
                    var audio = new Button
                    {
                        Content = tab.IsMuted ? "🔇" : "🔊",
                        ToolTip = tab.IsMuted ? "Zapnout zvuk této karty" : "Ztlumit tuto kartu",
                        Padding = new Thickness(3, 0, 3, 0),
                        Margin = new Thickness(3, 0, 0, 0),
                        MinWidth = 25,
                        Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(tab.IsMuted ? "#9EB8D4" : "#54D7F8"))
                    };

                    audio.Click += (_, e) =>
                    {
                        e.Handled = true;
                        ToggleTabMute(tab);
                    };

                    header.Children.Add(audio);
                }

                var close = new Button
                {
                    Content = "×",
                    Padding = new Thickness(5, 0, 0, 0),
                    Margin = new Thickness(4, 0, 0, 0),
                    ToolTip = "Zavřít kartu"
                };
                close.Click += (_, e) =>
                {
                    e.Handled = true;
                    CloseTab(tab);
                };
                header.Children.Add(close);
            }

            var button = new Button
            {
                Content = header,
                ToolTip = tab.IsPlayingAudio
                    ? tab.IsMuted
                        ? $"{tab.Title} · zvuk ztlumen"
                        : $"{tab.Title} · přehrává zvuk"
                    : tab.IsMuted
                        ? $"{tab.Title} · zvuk ztlumen"
                        : tab.Title,
                Width = tabWidth,
                Margin = new Thickness(3, 8, 0, 8),
                Background = tab == _active
                    ? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1B2A42"))
                    : new SolidColorBrush((Color)ColorConverter.ConvertFromString("#101B2B")),
                BorderBrush = tab == _active
                    ? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3B80B8"))
                    : new SolidColorBrush((Color)ColorConverter.ConvertFromString("#21324A")),
                BorderThickness = new Thickness(1),
                HorizontalContentAlignment = HorizontalAlignment.Left,
                AllowDrop = true,
                Tag = tab
            };

            button.PreviewMouseLeftButtonDown += (_, e) =>
            {
                if (e.ChangedButton != MouseButton.Left) return;
                _draggedTab = tab;
                _tabDragOrigin = e.GetPosition(TabsScroller);
                _suppressTabClick = false;
            };
            button.PreviewMouseMove += (_, e) => BeginTabDrag(button, tab, e);
            button.DragOver += (_, e) =>
            {
                if (e.Data.GetData(typeof(TabDragPayload)) is not TabDragPayload payload || payload.Tab == tab) return;
                if (!ReferenceEquals(payload.Source, this) && !CanReceiveTransferredTab(payload))
                {
                    e.Effects = DragDropEffects.None;
                    e.Handled = true;
                    return;
                }
                e.Effects = DragDropEffects.Move;
                HighlightTabDropTarget(button, e.GetPosition(button).X > button.ActualWidth / 2);
                e.Handled = true;
            };
            button.Drop += (_, e) =>
            {
                if (e.Data.GetData(typeof(TabDragPayload)) is not TabDragPayload payload || payload.Tab == tab) return;
                var insertAfter = e.GetPosition(button).X > button.ActualWidth / 2;
                if (ReferenceEquals(payload.Source, this))
                    ReorderTabs(payload.Tab, tab, insertAfter);
                else if (CanReceiveTransferredTab(payload))
                    _ = ReceiveDroppedTabAsync(payload, _tabs.IndexOf(tab) + (insertAfter ? 1 : 0));
                else
                {
                    e.Effects = DragDropEffects.None;
                    e.Handled = true;
                    return;
                }
                e.Effects = DragDropEffects.Move;
                ResetTabDropTarget();
                e.Handled = true;
            };
            button.PreviewMouseRightButtonDown += (_, e) =>
            {
                e.Handled = true;
                if (_tabActionsPopup != null) _tabActionsPopup.IsOpen = false;
                _tabActionsPopup = CreateTabActionsPopup(tab, button);
                _tabActionsPopup.IsOpen = true;
            };
            button.Click += (_, _) =>
            {
                if (_suppressTabClick) { _suppressTabClick = false; return; }
                SelectTab(tab);
            };
            TabsList.Items.Add(button);
        }
    }

    private void BeginTabDrag(Button source, BrowserTab tab, MouseEventArgs e)
    {
        if (_draggedTab != tab || _tabDragOrigin is null || e.LeftButton != MouseButtonState.Pressed)
            return;

        var current = e.GetPosition(TabsScroller);
        if (Math.Abs(current.X - _tabDragOrigin.Value.X) < SystemParameters.MinimumHorizontalDragDistance
            && Math.Abs(current.Y - _tabDragOrigin.Value.Y) < SystemParameters.MinimumVerticalDragDistance)
            return;

        _suppressTabClick = true;
        source.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(source.Opacity, .55, TimeSpan.FromMilliseconds(80)));
        ShowTabDragPreview(tab, GetSystemCursorPosition());
        GiveFeedbackEventHandler movePreview = (_, _) =>
            MoveTabDragPreview(GetSystemCursorPosition());
        source.GiveFeedback += movePreview;
        var cancelled = false;
        QueryContinueDragEventHandler cancellationTracker = (_, args) =>
        {
            if (args.EscapePressed || args.Action == DragAction.Cancel)
                cancelled = true;
        };
        source.QueryContinueDrag += cancellationTracker;
        try
        {
            var result = DragDrop.DoDragDrop(source, new DataObject(typeof(TabDragPayload), new TabDragPayload(this, tab)), DragDropEffects.Move);
            if (!cancelled && result == DragDropEffects.None && IsPointerOutsideTabStrip())
                TearOffTab(tab);
        }
        finally
        {
            source.QueryContinueDrag -= cancellationTracker;
            source.GiveFeedback -= movePreview;
            CloseTabDragPreview();
            ResetTabDropTarget();
            source.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(source.Opacity, 1, TimeSpan.FromMilliseconds(100)));
            _draggedTab = null;
            _tabDragOrigin = null;
        }
    }

    private void TabsScroller_DragOver(object sender, DragEventArgs e)
    {
        if (e.Data.GetData(typeof(TabDragPayload)) is not TabDragPayload)
            return;

        var payload = (TabDragPayload)e.Data.GetData(typeof(TabDragPayload));
        if (!ReferenceEquals(payload.Source, this) && !CanReceiveTransferredTab(payload))
        {
            e.Effects = DragDropEffects.None;
            e.Handled = true;
            return;
        }

        // The entire strip is a valid target, not just the visible tab buttons.
        // This mirrors Chromium's forgiving drop area and prevents an accidental
        // tear-off while aiming at a gap or the empty part of a short tab row.
        e.Effects = DragDropEffects.Move;
        e.Handled = true;
    }

    private void TabsScroller_Drop(object sender, DragEventArgs e)
    {
        if (e.Data.GetData(typeof(TabDragPayload)) is not TabDragPayload payload)
            return;

        var insertionIndex = GetTabInsertionIndex(e.GetPosition(TabsScroller));
        if (ReferenceEquals(payload.Source, this))
            MoveTabWithinWindow(payload.Tab, insertionIndex);
        else if (CanReceiveTransferredTab(payload))
            _ = ReceiveDroppedTabAsync(payload, insertionIndex);
        else
        {
            e.Effects = DragDropEffects.None;
            e.Handled = true;
            return;
        }

        e.Effects = DragDropEffects.Move;
        ResetTabDropTarget();
        e.Handled = true;
    }

    private int GetTabInsertionIndex(Point position)
    {
        var buttons = TabsList.Items.OfType<Button>().ToList();
        for (var index = 0; index < buttons.Count; index++)
        {
            var buttonPosition = buttons[index].TranslatePoint(new Point(0, 0), TabsScroller);
            if (position.X < buttonPosition.X + buttons[index].ActualWidth / 2)
                return index;
        }

        return _tabs.Count;
    }

    private void MoveTabWithinWindow(BrowserTab tab, int insertionIndex)
    {
        var sourceIndex = _tabs.IndexOf(tab);
        if (sourceIndex < 0)
            return;

        _tabs.RemoveAt(sourceIndex);
        if (sourceIndex < insertionIndex)
            insertionIndex--;
        _tabs.Insert(Math.Clamp(insertionIndex, 0, _tabs.Count), tab);
        RenderTabs();
    }

    private void CloseTabDragPreview()
    {
        if (_tabDragPreview is null) return;
        _tabDragPreview.IsOpen = false;
        ActiveTabDragPreviews.Remove(_tabDragPreview);
        _tabDragPreview = null;
    }

    private void ShowTabDragPreview(BrowserTab tab, Point screenPosition)
    {
        // A previous owner can disappear while a tab is being moved to another
        // window. Always remove any remaining overlay before showing the next one.
        foreach (var preview in ActiveTabDragPreviews.ToList())
            preview.IsOpen = false;
        ActiveTabDragPreviews.Clear();

        var header = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(10, 0, 9, 0) };
        if (tab.Favicon is not null)
            header.Children.Add(new Image { Source = tab.Favicon, Width = 18, Height = 18, Margin = new Thickness(0, 0, 8, 0) });
        else
            header.Children.Add(new TextBlock { Text = "◈", Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#54D7F8")), FontSize = 16, Margin = new Thickness(0, 0, 8, 0) });
        header.Children.Add(new TextBlock
        {
            Text = tab.Title,
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#EAF7FF")),
            FontWeight = FontWeights.SemiBold,
            TextTrimming = TextTrimming.CharacterEllipsis,
            Width = 148,
            VerticalAlignment = VerticalAlignment.Center
        });

        _tabDragPreview = new System.Windows.Controls.Primitives.Popup
        {
            AllowsTransparency = true,
            IsHitTestVisible = false,
            Placement = System.Windows.Controls.Primitives.PlacementMode.AbsolutePoint,
            StaysOpen = true,
            Child = new Border
            {
                Width = 205,
                Height = 42,
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1B3453")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#54D7F8")),
                BorderThickness = new Thickness(2),
                CornerRadius = new CornerRadius(8),
                Opacity = .94,
                Child = header,
                Effect = new System.Windows.Media.Effects.DropShadowEffect
                {
                    Color = Colors.Black,
                    Opacity = .7,
                    BlurRadius = 18,
                    ShadowDepth = 5
                }
            }
        };
        MoveTabDragPreview(screenPosition);
        _tabDragPreview.IsOpen = true;
        ActiveTabDragPreviews.Add(_tabDragPreview);
    }

    private void MoveTabDragPreview(Point screenPosition)
    {
        if (_tabDragPreview is null) return;
        _tabDragPreview.HorizontalOffset = screenPosition.X + 14;
        _tabDragPreview.VerticalOffset = screenPosition.Y + 14;
    }

    private Point GetSystemCursorPosition()
    {
        // During DoDragDrop WPF can keep reporting a location relative to the
        // source window even after the pointer has crossed into another window.
        // A Popup with those stale coordinates appears as a duplicate card at
        // the top-left of the desktop. Read the real screen cursor instead.
        if (!GetCursorPos(out var cursor))
            return PointToScreen(Mouse.GetPosition(this));

        var physicalPoint = new Point(cursor.X, cursor.Y);
        var presentationSource = PresentationSource.FromVisual(this);
        return presentationSource?.CompositionTarget?.TransformFromDevice.Transform(physicalPoint)
            ?? physicalPoint;
    }

    private void HighlightTabDropTarget(Button target, bool insertAfter)
    {
        if (_tabDropTarget == target && _tabDropAfter == insertAfter) return;
        ResetTabDropTarget();

        _tabDropTarget = target;
        _tabDropAfter = insertAfter;
        target.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#54D7F8"));
        // Keep the border thickness unchanged. Changing it during a drag makes WPF
        // re-measure the entire strip and is what caused neighbouring tabs to jump.
        target.BorderThickness = new Thickness(1);
        AnimateTabMargin(target, insertAfter
            ? new Thickness(3, 8, 28, 8)
            : new Thickness(28, 8, 3, 8));
    }

    private void ResetTabDropTarget()
    {
        if (_tabDropTarget == null) return;
        var target = _tabDropTarget;
        var targetTab = target.Tag as BrowserTab;
        target.BorderBrush = targetTab == _active
            ? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3B80B8"))
            : new SolidColorBrush((Color)ColorConverter.ConvertFromString("#21324A"));
        target.BorderThickness = new Thickness(1);
        AnimateTabMargin(target, new Thickness(3, 8, 0, 8));
        _tabDropTarget = null;
    }

    private static void AnimateTabMargin(FrameworkElement target, Thickness margin)
    {
        var previous = target.Margin;
        target.Margin = margin;
        target.BeginAnimation(FrameworkElement.MarginProperty, new ThicknessAnimation(previous, margin, TimeSpan.FromMilliseconds(140))
        {
            EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut }
        });
    }

    private bool IsPointerOutsideTabStrip()
    {
        var position = Mouse.GetPosition(TabsScroller);
        // A few pixels outside the strip are common while aiming for the edge of
        // another tab. Only detach after a deliberate pull out of the tab area.
        const double detachDistance = 48;
        return position.X < -detachDistance || position.X > TabsScroller.ActualWidth + detachDistance
            || position.Y < -detachDistance || position.Y > TabsScroller.ActualHeight + detachDistance;
    }

    private void ReorderTabs(BrowserTab dragged, BrowserTab target, bool insertAfter)
    {
        var sourceIndex = _tabs.IndexOf(dragged);
        var targetIndex = _tabs.IndexOf(target);
        if (sourceIndex < 0 || targetIndex < 0) return;

        _tabs.RemoveAt(sourceIndex);
        if (sourceIndex < targetIndex) targetIndex--;
        _tabs.Insert(insertAfter ? targetIndex + 1 : targetIndex, dragged);
        RenderTabs();
    }

    private async Task<bool> ReceiveDroppedTabAsync(TabDragPayload payload, int insertionIndex)
    {
        if (!CanReceiveTransferredTab(payload) || !TabTransferCoordinator.TryBegin(payload.Source, payload.Tab))
            return false;

        try
        {
            // The WPF WebView2 host knows how to re-parent its native controller
            // when the same control enters a different visual tree. Do it only
            // after the native OLE drop loop has ended: it preserves the live
            // page instead of constructing another controller and reloading it.
            return await Dispatcher.InvokeAsync(
                () => CompleteLiveTabTransfer(payload.Source, payload.Tab, insertionIndex),
                System.Windows.Threading.DispatcherPriority.ContextIdle);
        }
        catch
        {
            return false;
        }
        finally
        {
            TabTransferCoordinator.End(payload.Tab);
        }
    }

    private bool CanReceiveTransferredTab(TabDragPayload payload)
        => !_isClosing
            && IsLoaded
            && payload.Source != this
            && !payload.Source._isClosing
            && _isPrivateWindow == payload.Source._isPrivateWindow
            && (!_isPrivateWindow || payload.Tab.PrivateSession is not null)
            && payload.Tab.Owner == payload.Source
            && TabWindowRegistry.IsRegistered(_windowId, this)
            && TabWindowRegistry.IsRegistered(payload.Source._windowId, payload.Source);

    private bool CompleteLiveTabTransfer(MainWindow source, BrowserTab tab, int insertionIndex)
    {
        if (_isClosing || source._isClosing || tab.Owner != source)
            return false;

        var sourceIndex = source._tabs.IndexOf(tab);
        if (sourceIndex < 0)
            return false;

        var targetWasEmpty = _tabs.Count == 0;
        var targetPreviouslyActive = _active;
        var sourcePreviousPrivateSession = source._privateWebSession;
        var sourceWasActive = ReferenceEquals(source._active, tab);
        try
        {
            // An outstanding request belongs to the source window's address-bar
            // prompt. Resolve it as "later" before this live WebView is reparented.
            source.CancelPendingSitePermissionRequest(tab);
            // Remove the host from the old visual tree without disposing it.
            // Disposing is reserved for normal tab close and must never occur
            // while a live tab is handed to another browser window.
            if (sourceWasActive)
            {
                source.BrowserHost.Children.Remove(tab.View);
                source._active = null;
            }

            source._tabs.RemoveAt(sourceIndex);
            if (source._tabs.Count > 0)
                source.SelectTab(source._tabs[Math.Min(sourceIndex, source._tabs.Count - 1)]);
            else
                source.RenderTabs();
            source.ReconcilePrivateSessionForLocalTabs();

            insertionIndex = Math.Clamp(insertionIndex, 0, _tabs.Count);
            _tabs.Insert(insertionIndex, tab);
            tab.Owner = this;
            SelectTab(tab);

            // An empty private target becomes part of the moved tab's existing
            // session. This keeps later tabs in a torn-off window on the same
            // ephemeral profile. A populated target deliberately keeps its own
            // session: merging two live Chromium profiles would lose state.
            if (_isPrivateWindow && targetWasEmpty && tab.PrivateSession is not null)
                _privateWebSession = tab.PrivateSession;

        }
        catch
        {
            // A target failure must leave the original working tab in place.
            _tabs.Remove(tab);
            if (ReferenceEquals(_active, tab))
            {
                BrowserHost.Children.Remove(tab.View);
                _active = null;
            }
            tab.Owner = source;
            if (!source._tabs.Contains(tab))
                source._tabs.Insert(Math.Clamp(sourceIndex, 0, source._tabs.Count), tab);
            if (source._isPrivateWindow)
                source._privateWebSession = sourcePreviousPrivateSession;
            source.SelectTab(tab);

            // SelectTab clears the target host before it re-parents the moving
            // WebView. Restore the tab which had been visible in the target if
            // that re-parenting fails, otherwise the target would remain blank.
            if (targetPreviouslyActive is not null && _tabs.Contains(targetPreviouslyActive))
                SelectTab(targetPreviouslyActive);
            else
            {
                _active = null;
                BrowserHost.Children.Clear();
                RenderTabs();
            }
            return false;
        }

        // Closing is deliberately outside the transfer transaction. The target
        // already owns and displays the original WebView; a window-close handler
        // must not be able to roll that successful transfer back.
        if (source._tabs.Count == 0 && !source._isClosing)
        {
            try { source.Close(); }
            catch { source.StatusText.Text = "Karta byla přesunuta, zdrojové okno nelze nyní zavřít."; }
        }

        return true;
    }

    private void TearOffTab(BrowserTab tab)
    {
        if (_isClosing || tab.Owner != this || TabTransferCoordinator.IsInProgress(tab))
            return;

        StatusText.Text = "Odděluji kartu do nového okna…";
        var cursor = GetSystemCursorPosition();
        var detached = new MainWindow(privateWindow: _isPrivateWindow, startEmpty: true)
        {
            Width = Math.Max(960, ActualWidth),
            Height = Math.Max(650, ActualHeight),
            Left = cursor.X - 120,
            Top = cursor.Y - 24
        };
        detached.Loaded += (_, _) =>
        {
            _ = MoveTabToNewWindowAsync(tab, detached);
        };
        detached.Show();
    }

    private async Task MoveTabToNewWindowAsync(BrowserTab tab, MainWindow target)
    {
        var moved = await target.ReceiveDroppedTabAsync(new TabDragPayload(this, tab), 0);
        if (!moved && !target._isClosing && target._tabs.Count == 0)
            target.Close();
    }

    private void ToggleTabMute(BrowserTab tab)
    {
        var core = tab.View.CoreWebView2;
        if (core == null) return;

        try
        {
            core.IsMuted = !core.IsMuted;
            tab.IsMuted = core.IsMuted;
            StatusText.Text = tab.IsMuted
                ? $"Karta „{tab.Title}“ byla ztlumena"
                : $"Zvuk karty „{tab.Title}“ byl zapnut";
            RenderTabs();
        }
        catch (Exception error)
        {
            StatusText.Text = "Zvuk karty se nepodařilo změnit: " + error.Message;
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
    private void UpdateTabTitle(BrowserTab tab, string? observedTitle = null)
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.BeginInvoke(() => UpdateTabTitle(tab, observedTitle));
            return;
        }

        if (!_tabs.Contains(tab))
            return;

        var title = observedTitle ?? tab.View.CoreWebView2?.DocumentTitle;
        var previousCount = tab.NotificationCount;
        tab.Title = tab.IsYamaNewTab
            ? "YamaSearch"
            : string.IsNullOrWhiteSpace(title) ? "Nová karta" : title;
        var currentCount = TryGetNotificationCount(tab.Title);
        tab.NotificationCount = currentCount;
        if (previousCount is > 0 && currentCount is (null or 0))
        {
            tab.HasWebNotification = false;
        }
        else if (_settings.Data.EnableTabNotificationIndicators
                 && !ReferenceEquals(tab, _active)
                 && (previousCount is null or 0 || currentCount > previousCount))
        {
            tab.HasWebNotification = true;
        }
        RenderTabs();
    }

    private void ResetTabPageState(BrowserTab tab)
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.BeginInvoke(() => ResetTabPageState(tab));
            return;
        }

        tab.Title = tab.IsYamaNewTab ? "YamaSearch" : "Načítání…";
        tab.NotificationCount = null;
        tab.HasWebNotification = false;
        RenderTabs();
    }
    private void UpdateFavicon(BrowserTab tab)
    {
        if (Uri.TryCreate(tab.View.CoreWebView2.FaviconUri, UriKind.Absolute, out var favicon))
        {
            try { tab.Favicon = new BitmapImage(favicon); } catch { tab.Favicon = null; }
        }
        Dispatcher.BeginInvoke(RenderTabs);
    }

    private static int? TryGetNotificationCount(string title)
    {
        var match = Regex.Match(title, @"(?:^|\s)[\[(]\s*(\d{1,4})\+?\s*[\])]");
        return match.Success && int.TryParse(match.Groups[1].Value, out var count) ? count : null;
    }

    private void HandleWebNotification(BrowserTab tab, CoreWebView2NotificationReceivedEventArgs e)
    {
        if (_settings.Data.EnableTabNotificationIndicators)
        {
            // An event raised by the page currently being viewed is already
            // visible to the user and must not immediately recreate the dot.
            tab.HasWebNotification = !ReferenceEquals(tab, _active);
            Dispatcher.BeginInvoke(RenderTabs);
        }

        if (!_settings.Data.EnableNativeNotifications)
        {
            e.Handled = true;
            try { e.Notification.ReportClosed(); } catch { }
            return;
        }

        WindowsToastService.TryShow(tab, e, _settings.Data.EnableNotificationSound);
    }

    internal bool ActivateNotificationTab(Guid tabId)
    {
        var tab = _tabs.FirstOrDefault(candidate => candidate.Id == tabId);
        if (tab is null)
            return false;

        SelectTab(tab);
        Show();
        Activate();
        tab.HasWebNotification = false;
        RenderTabs();
        return true;
    }

    internal bool ActivateExistingNotificationUrl(string url)
    {
        var tab = _tabs.FirstOrDefault(candidate => UrlsMatch(candidate.View.CoreWebView2?.Source, url));
        if (tab is null)
            return false;

        SelectTab(tab);
        Show();
        Activate();
        tab.HasWebNotification = false;
        RenderTabs();
        return true;
    }

    internal void OpenNotificationUrl(string url)
    {
        Show();
        Activate();
        _ = CreateTabAsync(url);
    }

    private static bool UrlsMatch(string? left, string right)
        => Uri.TryCreate(left, UriKind.Absolute, out var leftUri)
           && Uri.TryCreate(right, UriKind.Absolute, out var rightUri)
           && Uri.Compare(leftUri, rightUri, UriComponents.HttpRequestUrl, UriFormat.SafeUnescaped, StringComparison.OrdinalIgnoreCase) == 0;
    private void DisposeBrowserTab(BrowserTab tab)
    {
        CancelPendingSitePermissionRequest(tab);
        tab.PermissionActivities.Clear();
        var session = tab.PrivateSession;
        var initialization = tab.PrivateInitialization;
        try { tab.View.Dispose(); }
        finally
        {
            if (initialization is not null)
            {
                tab.PrivateInitialization = null;
                // Dispose releases every COM resource held by this WPF WebView2
                // control. Query only afterwards, on the UI thread, so a pending
                // Ensure task cannot leave the private profile blocked when the
                // application dispatcher is shutting down.
                session?.CancelControllerInitialization(initialization, HasLiveWebViewProcess(initialization.Environment));
            }
            tab.PrivateSession = null;
            session?.ReleaseTab();
        }
    }

    private void CloseTab(BrowserTab tab) { if (_tabs.Count == 1) { _ = NavigateAsync(tab, _settings.Data.HomePage); return; } var index = _tabs.IndexOf(tab); _tabs.Remove(tab); DisposeBrowserTab(tab); SelectTab(_tabs[Math.Max(0, index - 1)]); }
    private void CloseOtherTabs(BrowserTab keep)
    {
        foreach (var tab in _tabs.Where(tab => tab != keep).ToList()) { _tabs.Remove(tab); DisposeBrowserTab(tab); }
        SelectTab(keep);
    }
    private void CloseTabsToRight(BrowserTab keep)
    {
        var index = _tabs.IndexOf(keep);
        foreach (var tab in _tabs.Skip(index + 1).ToList()) { _tabs.Remove(tab); DisposeBrowserTab(tab); }
        SelectTab(keep);
    }
    private void NewTab_Click(object sender, RoutedEventArgs e) => _ = CreateTabAsync();
    private void Back_Click(object sender, RoutedEventArgs e) { if (_active?.View.CoreWebView2.CanGoBack == true) _active.View.CoreWebView2.GoBack(); }
    private void Forward_Click(object sender, RoutedEventArgs e) { if (_active?.View.CoreWebView2.CanGoForward == true) _active.View.CoreWebView2.GoForward(); }
    private void Reload_Click(object sender, RoutedEventArgs e) => _active?.View.CoreWebView2.Reload();

    private void UpdateNavigationControls()
    {
        var core = _active?.View.CoreWebView2;
        BackButton.Visibility = core?.CanGoBack == true ? Visibility.Visible : Visibility.Collapsed;
        ForwardButton.Visibility = core?.CanGoForward == true ? Visibility.Visible : Visibility.Collapsed;
        ReloadButton.Visibility = core != null ? Visibility.Visible : Visibility.Collapsed;
    }

    private void Home_Click(object sender, RoutedEventArgs e)
    {
        if (_active == null) return;
        var home = string.IsNullOrWhiteSpace(_settings.Data.HomePage) ? "yamasearch://newtab" : _settings.Data.HomePage;
        _ = NavigateAsync(_active, home);
    }
    private void AddressBox_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key is Key.Down or Key.Up)
        {
            if (!AddressSuggestions.IsOpen)
                ShowAddressSuggestions();

            MoveAddressSuggestionSelection(e.Key == Key.Down ? 1 : -1);
            e.Handled = true;
            return;
        }

        if (e.Key == Key.Escape && AddressSuggestions.IsOpen)
        {
            AddressSuggestions.IsOpen = false;
            _addressSuggestionIndex = -1;
            e.Handled = true;
        }
    }

    private void AddressBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter || _active == null) return;

        var buttons = AddressSuggestionList.Children.OfType<Button>().ToList();
        if (AddressSuggestions.IsOpen
            && _addressSuggestionIndex >= 0
            && _addressSuggestionIndex < buttons.Count)
        {
            var selected = buttons[_addressSuggestionIndex];
            selected.RaiseEvent(new RoutedEventArgs(Button.ClickEvent, selected));
            e.Handled = true;
            return;
        }

        AddressSuggestions.IsOpen = false;
        _addressSuggestionIndex = -1;
        _ = NavigateAsync(_active, AddressBox.Text);
        e.Handled = true;
    }

    private void MoveAddressSuggestionSelection(int delta)
    {
        var buttons = AddressSuggestionList.Children.OfType<Button>().ToList();
        if (buttons.Count == 0) return;

        if (_addressSuggestionIndex < 0)
            _addressSuggestionIndex = delta > 0 ? 0 : buttons.Count - 1;
        else
            _addressSuggestionIndex = (_addressSuggestionIndex + delta + buttons.Count) % buttons.Count;

        ApplyAddressSuggestionSelection();
    }

    private void ApplyAddressSuggestionSelection()
    {
        var buttons = AddressSuggestionList.Children.OfType<Button>().ToList();
        for (var i = 0; i < buttons.Count; i++)
        {
            var button = buttons[i];
            var isSelected = i == _addressSuggestionIndex;
            var isPrimarySearch = button.Tag is bool highlight && highlight;

            button.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(
                isSelected ? "#21496B" : isPrimarySearch ? "#1C3553" : "#132238"));
            button.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(
                isSelected ? "#38D9FF" : isPrimarySearch ? "#315B82" : "#1D3857"));
        }
    }

    private void AddressBox_GotKeyboardFocus(object sender, KeyboardFocusChangedEventArgs e)
    {
        PrepareAddressBoxForInput();

        // Při kliknutí myší se popup otevře až po MouseUp. Kdyby se otevřel už
        // během MouseDown, WPF ho může okamžitě vyhodnotit jako kliknutí mimo popup
        // a zase zavřít — přesně to způsobovalo první krátké probliknutí.
        if (Mouse.LeftButton != MouseButtonState.Pressed)
            ScheduleAddressSuggestions();
    }

    private void AddressBox_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        var cleared = PrepareAddressBoxForInput();

        if (!AddressBox.IsKeyboardFocusWithin)
        {
            // Stejně jako v běžných prohlížečích: první kliknutí do adresního pole
            // označí celou aktuální adresu. První napsaný znak ji tak rovnou nahradí.
            AddressBox.Focus();

            if (cleared)
                AddressBox.CaretIndex = 0;
            else
                AddressBox.SelectAll();

            // Nedovolíme původnímu MouseDown přesunout caret dovnitř označené URL.
            // Druhé kliknutí už funguje normálně a uživatel může kurzor umístit ručně.
            e.Handled = true;
            return;
        }

        if (cleared)
            AddressBox.CaretIndex = 0;
    }

    private void AddressBox_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (!AddressBox.IsKeyboardFocusWithin)
            return;

        ScheduleAddressSuggestions();
    }

    private void ScheduleAddressSuggestions()
    {
        _ = Dispatcher.BeginInvoke(
            System.Windows.Threading.DispatcherPriority.ApplicationIdle,
            new Action(() =>
            {
                if (AddressBox.IsKeyboardFocusWithin)
                    ShowAddressSuggestions();
            }));
    }

    private bool PrepareAddressBoxForInput()
    {
        var current = AddressBox.Text.Trim();
        if (!current.Equals("about:blank", StringComparison.OrdinalIgnoreCase)
            && !current.Equals("YamaSearch — nová karta", StringComparison.OrdinalIgnoreCase)) return false;

        _suppressSuggestions = true;
        AddressBox.Clear();
        AddressBox.CaretIndex = 0;
        _suppressSuggestions = false;
        return true;
    }

    private void AddressBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_suppressSuggestions || !AddressBox.IsKeyboardFocusWithin)
        {
            AddressSuggestions.IsOpen = false;
            return;
        }

        ShowAddressSuggestions();
    }

    private System.Windows.Controls.Primitives.CustomPopupPlacement[] AddressSuggestions_CustomPopupPlacement(Size popupSize, Size targetSize, Point offset)
    {
        return
        [
            new System.Windows.Controls.Primitives.CustomPopupPlacement(
                new Point(0, targetSize.Height),
                System.Windows.Controls.Primitives.PopupPrimaryAxis.Horizontal)
        ];
    }

    private void ShowAddressSuggestions()
    {
        AddressSuggestionsBorder.Width = Math.Max(360, AddressBox.ActualWidth);
        AddressSuggestionList.Children.Clear();
        _addressSuggestionIndex = -1;
        if (_suppressSuggestions || !AddressBox.IsKeyboardFocusWithin)
        {
            AddressSuggestions.IsOpen = false;
            return;
        }

        var query = AddressBox.Text.Trim();
        if (query.Length == 0)
        {
            foreach (var item in _settings.Data.History
                .Where(x => !string.IsNullOrWhiteSpace(x.Url))
                .Take(6))
            {
                var title = string.IsNullOrWhiteSpace(item.Title) ? item.Url : item.Title;
                var suggestion = CreateSuggestionButton(title, item.Url, "◷", false, item.FaviconUrl);
                suggestion.Click += (_, _) =>
                {
                    AddressSuggestions.IsOpen = false;
                    if (_active != null) _ = NavigateAsync(_active, item.Url);
                };
                AddressSuggestionList.Children.Add(suggestion);
            }

            AddressSuggestions.IsOpen = AddressSuggestionList.Children.Count > 0;
            return;
        }

        var search = CreateSuggestionButton($"Hledat „{query}“ v {_settings.Data.SearchEngine}", "Potvrďte Enterem nebo kliknutím", "⌕", true);
        search.Click += (_, _) =>
        {
            AddressSuggestions.IsOpen = false;
            if (_active != null) _ = NavigateAsync(_active, query);
        };
        AddressSuggestionList.Children.Add(search);

        foreach (var item in _settings.Data.History
            .Where(x => x.Url.Contains(query, StringComparison.OrdinalIgnoreCase)
                || x.Title.Contains(query, StringComparison.OrdinalIgnoreCase))
            .Take(4))
        {
            var title = string.IsNullOrWhiteSpace(item.Title) ? item.Url : item.Title;
            var suggestion = CreateSuggestionButton(title, item.Url, "↗", false, item.FaviconUrl);
            suggestion.Click += (_, _) =>
            {
                AddressSuggestions.IsOpen = false;
                if (_active != null) _ = NavigateAsync(_active, item.Url);
            };
            AddressSuggestionList.Children.Add(suggestion);
        }

        AddressSuggestions.IsOpen = true;
    }
    private Button CreateSuggestionButton(string title, string subtitle, string glyph, bool highlight, string? faviconUrl = null)
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
        var button = new Button
        {
            Content = layout,
            Tag = highlight,
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            Padding = new Thickness(11, 8, 11, 8),
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(baseBackground)),
            BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(highlight ? "#315B82" : "#1D3857")),
            BorderThickness = new Thickness(1),
            Margin = new Thickness(0, 3, 0, 3)
        };
        button.MouseEnter += (_, _) =>
        {
            _addressSuggestionIndex = AddressSuggestionList.Children.IndexOf(button);
            ApplyAddressSuggestionSelection();
        };
        return button;
    }
    private void SetAddressText(string value)
    {
        _suppressSuggestions = true;
        AddressBox.Text = value;
        _suppressSuggestions = false;
        AddressSuggestions.IsOpen = false;
        _addressSuggestionIndex = -1;
    }
    private void Go_Click(object sender, RoutedEventArgs e)
    {
        if (_active?.View.CoreWebView2 != null) _ = NavigateAsync(_active, AddressBox.Text);
        else StatusText.Text = "Webový engine se ještě spouští…";
    }
    private void FavoritesButton_Click(object sender, RoutedEventArgs e)
    {
        HistoryQuickPopup.IsOpen = false;
        DownloadPopup.IsOpen = false;
        FavoritesOverflowPopup.IsOpen = false;
        UpdateFavoritesPopupState();
        FavoritesQuickPopup.IsOpen = !FavoritesQuickPopup.IsOpen;
    }

    private void UpdateFavoritesPopupState()
    {
        ShowFavoritesBarCheckBox.IsChecked = _settings.Data.FavoritesBarVisible;

        if (_active?.View.CoreWebView2 == null || _active.IsYamaNewTab)
        {
            FavoriteCurrentPageButton.Content = "☆ Přidat aktuální stránku";
            FavoriteCurrentPageButton.IsEnabled = false;
            return;
        }

        FavoriteCurrentPageButton.IsEnabled = true;
        var url = _active.View.CoreWebView2.Source;
        FavoriteCurrentPageButton.Content = FindFavoriteIndex(url) >= 0
            ? "★ Odebrat aktuální stránku"
            : "☆ Přidat aktuální stránku";
    }

    private void FavoriteCurrentPage_Click(object sender, RoutedEventArgs e)
    {
        ToggleCurrentFavorite();
        UpdateFavoritesPopupState();
    }

    private void ToggleCurrentFavorite()
    {
        if (_active?.View.CoreWebView2 == null || _active.IsYamaNewTab)
        {
            StatusText.Text = "Na nové kartě použij tlačítko Přidat stránku.";
            return;
        }

        var url = _active.View.CoreWebView2.Source;
        if (!TryNormalizeFavoriteUrl(url, out var normalized)) return;

        var index = FindFavoriteIndex(normalized);
        if (index >= 0)
        {
            _settings.Data.Bookmarks.RemoveAt(index);
            StatusText.Text = "Odebráno z oblíbených";
        }
        else
        {
            _settings.Data.Bookmarks.Insert(0, normalized);
            StatusText.Text = "Přidáno do oblíbených";
        }

        _settings.Save();
        RefreshFavoriteViews();
    }

    private void ShowFavoritesBarCheckBox_Click(object sender, RoutedEventArgs e)
    {
        _settings.Data.FavoritesBarVisible = ShowFavoritesBarCheckBox.IsChecked == true;
        _settings.Save();
        FavoritesBar.Visibility = _settings.Data.FavoritesBarVisible ? Visibility.Visible : Visibility.Collapsed;
        RenderFavoritesBar();
        StatusText.Text = _settings.Data.FavoritesBarVisible
            ? "Lišta oblíbených je zapnutá"
            : "Lišta oblíbených je skrytá";
    }

    private void ManageFavorites_Click(object sender, RoutedEventArgs e)
    {
        FavoritesQuickPopup.IsOpen = false;
        SidePanel.Visibility = Visibility.Visible;
        PanelColumn.Width = new GridLength(300);
        ShowBookmarksPanel();
    }

    private void FavoritesBar_SizeChanged(object sender, SizeChangedEventArgs e)
        => RenderFavoritesBar();

    private void RenderFavoritesBar()
    {
        FavoritesBarItems.Children.Clear();
        FavoritesOverflowList.Children.Clear();
        _favoriteOverflow.Clear();

        if (!_settings.Data.FavoritesBarVisible || FavoritesBar.Visibility != Visibility.Visible)
        {
            FavoritesOverflowButton.Visibility = Visibility.Collapsed;
            FavoritesOverflowPopup.IsOpen = false;
            return;
        }

        var bookmarks = _settings.Data.Bookmarks.ToList();
        if (bookmarks.Count == 0)
        {
            FavoritesOverflowButton.Visibility = Visibility.Collapsed;
            FavoritesBarItems.Children.Add(new TextBlock
            {
                Text = "Oblíbené jsou prázdné",
                Foreground = (Brush)FindResource("MutedBrush"),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0)
            });
            return;
        }

        var available = Math.Max(120, FavoritesBar.ActualWidth - 74);
        double used = 0;

        for (var i = 0; i < bookmarks.Count; i++)
        {
            var url = bookmarks[i];
            var button = CreateFavoriteBarButton(url, compact: true);
            button.Measure(new Size(double.PositiveInfinity, 34));
            var width = Math.Clamp(button.DesiredSize.Width, 88, 190);

            if (used + width <= available || FavoritesBarItems.Children.Count == 0)
            {
                button.Width = width;
                FavoritesBarItems.Children.Add(button);
                used += width + 5;
            }
            else
            {
                _favoriteOverflow.Add(url);
            }
        }

        FavoritesOverflowButton.Visibility = _favoriteOverflow.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        if (_favoriteOverflow.Count == 0) FavoritesOverflowPopup.IsOpen = false;
    }

    private Button CreateFavoriteBarButton(string url, bool compact)
    {
        var history = _settings.Data.History.FirstOrDefault(x => SameFavorite(x.Url, url));
        var label = string.IsNullOrWhiteSpace(history?.Title)
            ? (Uri.TryCreate(url, UriKind.Absolute, out var page) ? page.Host.Replace("www.", "", StringComparison.OrdinalIgnoreCase) : url)
            : history.Title.Trim();

        if (label.Length > 22) label = label[..21] + "…";

        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(24) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var iconHost = new Grid { Width = 18, Height = 18, VerticalAlignment = VerticalAlignment.Center };
        iconHost.Children.Add(new TextBlock
        {
            Text = "✦",
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#54D7F8")),
            FontSize = 14,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        });

        var faviconUrl = history?.FaviconUrl;
        if (string.IsNullOrWhiteSpace(faviconUrl) && Uri.TryCreate(url, UriKind.Absolute, out var favoriteUri))
            faviconUrl = $"{favoriteUri.Scheme}://{favoriteUri.Host}/favicon.ico";

        if (Uri.TryCreate(faviconUrl, UriKind.Absolute, out var favicon))
        {
            try
            {
                var image = new Image
                {
                    Source = new BitmapImage(favicon),
                    Width = 16,
                    Height = 16,
                    Stretch = Stretch.Uniform
                };
                image.ImageFailed += (_, _) => image.Visibility = Visibility.Collapsed;
                iconHost.Children.Add(image);
            }
            catch { }
        }

        grid.Children.Add(iconHost);
        var text = new TextBlock
        {
            Text = label,
            Foreground = Brushes.White,
            VerticalAlignment = VerticalAlignment.Center,
            TextTrimming = TextTrimming.CharacterEllipsis
        };
        Grid.SetColumn(text, 1);
        grid.Children.Add(text);

        var button = new Button
        {
            Content = grid,
            ToolTip = url,
            HorizontalContentAlignment = HorizontalAlignment.Left,
            Padding = compact ? new Thickness(8, 4, 9, 4) : new Thickness(9, 7, 9, 7),
            Margin = compact ? new Thickness(0, 0, 5, 0) : new Thickness(0, 2, 0, 2),
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#142238")),
            BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#294465")),
            BorderThickness = new Thickness(1)
        };

        button.Click += (_, _) =>
        {
            FavoritesOverflowPopup.IsOpen = false;
            if (_active != null) _ = NavigateAsync(_active, url);
        };
        return button;
    }

    private void FavoritesOverflowButton_Click(object sender, RoutedEventArgs e)
    {
        FavoritesOverflowList.Children.Clear();
        foreach (var url in _favoriteOverflow)
            FavoritesOverflowList.Children.Add(CreateFavoriteBarButton(url, compact: false));

        FavoritesOverflowPopup.IsOpen = !FavoritesOverflowPopup.IsOpen;
    }

    private void HandleDownloadStarting(CoreWebView2DownloadStartingEventArgs e)
    {
        var operation = e.DownloadOperation;
        var path = operation.ResultFilePath ?? "";
        var entry = new DownloadEntry
        {
            Id = Guid.NewGuid().ToString("N"),
            Url = operation.Uri ?? "",
            FilePath = path,
            FileName = string.IsNullOrWhiteSpace(path) ? "Stažený soubor" : Path.GetFileName(path),
            BytesReceived = operation.BytesReceived,
            TotalBytes = operation.TotalBytesToReceive is ulong total && total <= long.MaxValue ? (long)total : 0,
            State = "Probíhá",
            StartedAt = DateTimeOffset.Now
        };

        _settings.Data.Downloads.Insert(0, entry);
        if (_settings.Data.Downloads.Count > 300)
            _settings.Data.Downloads.RemoveRange(300, _settings.Data.Downloads.Count - 300);
        _settings.Save();

        _activeDownloads[operation] = entry;
        operation.BytesReceivedChanged += (_, _) => Dispatcher.BeginInvoke(() => UpdateDownloadEntry(operation, entry, false));
        operation.StateChanged += (_, _) => Dispatcher.BeginInvoke(() => UpdateDownloadEntry(operation, entry, true));

        StatusText.Text = $"Stahování: {entry.FileName}";
        UpdateDownloadEntry(operation, entry, false);
    }

    private void UpdateDownloadEntry(CoreWebView2DownloadOperation operation, DownloadEntry entry, bool persist)
    {
        entry.BytesReceived = operation.BytesReceived;
        entry.TotalBytes = operation.TotalBytesToReceive is ulong total && total <= long.MaxValue ? (long)total : 0;
        entry.FilePath = operation.ResultFilePath ?? entry.FilePath;
        if (!string.IsNullOrWhiteSpace(entry.FilePath))
            entry.FileName = Path.GetFileName(entry.FilePath);

        entry.State = operation.State switch
        {
            CoreWebView2DownloadState.Completed => "Dokončeno",
            CoreWebView2DownloadState.Interrupted => "Přerušeno",
            _ => "Probíhá"
        };

        if (operation.State == CoreWebView2DownloadState.Completed)
        {
            entry.CompletedAt ??= DateTimeOffset.Now;
            _activeDownloads.Remove(operation);
            StatusText.Text = $"Staženo: {entry.FileName}";
            persist = true;
        }
        else if (operation.State == CoreWebView2DownloadState.Interrupted)
        {
            entry.CompletedAt ??= DateTimeOffset.Now;
            _activeDownloads.Remove(operation);
            StatusText.Text = $"Stahování přerušeno: {entry.FileName}";
            persist = true;
        }

        if (persist) _settings.Save();
        QueueDownloadUiRefresh();
    }

    private void QueueDownloadUiRefresh()
    {
        if (_downloadUiRefreshQueued) return;
        _downloadUiRefreshQueued = true;
        _ = Dispatcher.BeginInvoke(
            System.Windows.Threading.DispatcherPriority.ContextIdle,
            new Action(() =>
            {
                _downloadUiRefreshQueued = false;
                UpdateDownloadToolbar();
                if (DownloadPopup.IsOpen) RenderDownloadQuickPopup();
                if (SidePanel.Visibility == Visibility.Visible && PanelTitle.Text == "Stahování")
                    ShowDownloadsPanel();
            }));
    }

    private void UpdateDownloadToolbar()
    {
        var active = _settings.Data.Downloads.FirstOrDefault(x => x.State == "Probíhá");
        if (active != null)
        {
            var progress = active.TotalBytes > 0 ? Math.Clamp((double)active.BytesReceived / active.TotalBytes, 0, 1) : 0.18;
            DownloadProgressFill.Height = 24 * progress;
            DownloadProgressFill.Visibility = Visibility.Visible;
            DownloadArrowIcon.Visibility = Visibility.Visible;
            DownloadCheckMark.Visibility = Visibility.Collapsed;
            DownloadButton.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#54D7F8"));
            DownloadButton.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2F7EAA"));
            DownloadButton.ToolTip = active.TotalBytes > 0
                ? $"Stahování · {progress:P0} · {active.FileName}"
                : $"Stahování · {active.FileName}";
            return;
        }

        DownloadProgressFill.Height = 0;
        DownloadProgressFill.Visibility = Visibility.Collapsed;
        var latest = _settings.Data.Downloads.FirstOrDefault();
        var completed = latest?.State == "Dokončeno";
        DownloadArrowIcon.Visibility = completed ? Visibility.Collapsed : Visibility.Visible;
        DownloadCheckMark.Visibility = completed ? Visibility.Visible : Visibility.Collapsed;
        DownloadButton.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(completed ? "#4ADE80" : "#7DDFFF"));
        DownloadButton.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(completed ? "#2F855A" : "#31537D"));
        DownloadButton.ToolTip = completed ? $"Staženo · {latest!.FileName}" : "Stahování";
    }

    private void DownloadButton_Click(object sender, RoutedEventArgs e)
    {
        HistoryQuickPopup.IsOpen = false;
        RenderDownloadQuickPopup();
        DownloadPopup.IsOpen = !DownloadPopup.IsOpen;
    }

    private void HistoryQuickButton_Click(object sender, RoutedEventArgs e)
    {
        DownloadPopup.IsOpen = false;
        RenderHistoryQuickPopup();
        HistoryQuickPopup.IsOpen = !HistoryQuickPopup.IsOpen;
    }

    private void RenderDownloadQuickPopup()
    {
        DownloadQuickList.Children.Clear();
        var recent = _settings.Data.Downloads.Take(5).ToList();
        DownloadPopupStatus.Text = _activeDownloads.Count > 0 ? $"{_activeDownloads.Count} aktivní" : "poslední soubory";

        if (recent.Count == 0)
        {
            DownloadQuickList.Children.Add(new TextBlock
            {
                Text = "Zatím nebyly staženy žádné soubory.",
                Foreground = (Brush)FindResource("MutedBrush"),
                Margin = new Thickness(8, 12, 8, 12),
                TextWrapping = TextWrapping.Wrap
            });
            return;
        }

        foreach (var item in recent)
            DownloadQuickList.Children.Add(CreateDownloadQuickItem(item));
    }

    private FrameworkElement CreateDownloadQuickItem(DownloadEntry entry)
    {
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(34) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var state = new TextBlock
        {
            Text = entry.State == "Dokončeno" ? "✓" : entry.State == "Přerušeno" ? "!" : "⇩",
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(entry.State == "Dokončeno" ? "#4ADE80" : entry.State == "Přerušeno" ? "#FCA5A5" : "#54D7F8")),
            FontSize = 18,
            FontWeight = FontWeights.SemiBold,
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center
        };
        grid.Children.Add(state);

        var info = new StackPanel();
        info.Children.Add(new TextBlock { Text = entry.FileName, Foreground = Brushes.White, FontWeight = FontWeights.SemiBold, TextTrimming = TextTrimming.CharacterEllipsis });
        var progress = entry.TotalBytes > 0 ? Math.Clamp((double)entry.BytesReceived / entry.TotalBytes, 0, 1) : 0;
        var subtitle = entry.State == "Probíhá"
            ? (entry.TotalBytes > 0 ? $"{progress:P0} · {FormatBytes(entry.BytesReceived)} z {FormatBytes(entry.TotalBytes)}" : $"{FormatBytes(entry.BytesReceived)} staženo")
            : $"{entry.State} · {entry.StartedAt:dd.MM. HH:mm}";
        info.Children.Add(new TextBlock { Text = subtitle, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#91A8C2")), FontSize = 11, Margin = new Thickness(0, 3, 0, 0), TextTrimming = TextTrimming.CharacterEllipsis });
        if (entry.State == "Probíhá")
        {
            info.Children.Add(new ProgressBar { Minimum = 0, Maximum = 1, Value = progress, Height = 4, Margin = new Thickness(0, 6, 0, 0) });
        }

        Grid.SetColumn(info, 1);
        grid.Children.Add(info);

        var button = new Button
        {
            Content = grid,
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#132238")),
            BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1D3857")),
            BorderThickness = new Thickness(1),
            Margin = new Thickness(0, 3, 0, 3),
            Padding = new Thickness(8)
        };
        button.Click += (_, _) =>
        {
            if (entry.State == "Dokončeno") OpenDownloadedFile(entry);
        };
        return button;
    }

    private void RenderHistoryQuickPopup()
    {
        HistoryQuickList.Children.Clear();
        var recent = _settings.Data.History.Take(6).ToList();
        if (recent.Count == 0)
        {
            HistoryQuickList.Children.Add(new TextBlock
            {
                Text = "Historie je zatím prázdná.",
                Foreground = (Brush)FindResource("MutedBrush"),
                Margin = new Thickness(8, 12, 8, 12)
            });
            return;
        }

        foreach (var entry in recent)
        {
            var title = string.IsNullOrWhiteSpace(entry.Title) ? entry.Url : entry.Title;
            var item = CreateSuggestionButton(title, entry.Url, "◷", false, entry.FaviconUrl);
            item.Margin = new Thickness(0, 3, 0, 3);
            item.Click += (_, _) =>
            {
                HistoryQuickPopup.IsOpen = false;
                if (_active != null) _ = NavigateAsync(_active, entry.Url);
            };
            HistoryQuickList.Children.Add(item);
        }
    }

    private void ShowAllDownloads_Click(object sender, RoutedEventArgs e)
    {
        DownloadPopup.IsOpen = false;
        var window = new DownloadsWindow(_settings, OnDownloadsChanged) { Owner = this };
        window.Show();
    }

    private void ShowAllHistory_Click(object sender, RoutedEventArgs e)
    {
        HistoryQuickPopup.IsOpen = false;
        var window = new HistoryWindow(
            _settings,
            url => { if (_active != null) _ = NavigateAsync(_active, url); },
            OnHistoryChanged) { Owner = this };
        window.Show();
    }

    private void OnDownloadsChanged()
    {
        _settings.Save();
        UpdateDownloadToolbar();
        if (DownloadPopup.IsOpen) RenderDownloadQuickPopup();
        if (SidePanel.Visibility == Visibility.Visible && PanelTitle.Text.Contains("Stahování", StringComparison.Ordinal))
            ShowDownloadsPanel();
    }

    private void OnHistoryChanged()
    {
        _settings.Save();
        RefreshFavoriteViews();
        if (HistoryQuickPopup.IsOpen) RenderHistoryQuickPopup();
        if (SidePanel.Visibility == Visibility.Visible && PanelTitle.Text.Contains("Historie", StringComparison.Ordinal))
            ShowHistoryPanel();
    }

    private void OpenDownloadedFile(DownloadEntry entry)
    {
        try
        {
            if (!string.IsNullOrWhiteSpace(entry.FilePath) && File.Exists(entry.FilePath))
                Process.Start(new ProcessStartInfo(entry.FilePath) { UseShellExecute = true });
            else
                StatusText.Text = "Stažený soubor už na disku není.";
        }
        catch (Exception error)
        {
            StatusText.Text = "Soubor se nepodařilo otevřít: " + error.Message;
        }
    }

    private static string FormatBytes(long bytes)
    {
        string[] units = ["B", "KB", "MB", "GB", "TB"];
        var value = Math.Max(0, (double)bytes);
        var unit = 0;
        while (value >= 1024 && unit < units.Length - 1) { value /= 1024; unit++; }
        return unit == 0 ? $"{value:0} {units[unit]}" : $"{value:0.##} {units[unit]}";
    }

    private void Menu_Click(object sender, RoutedEventArgs e)
    {
        if (_siteAppMode && _siteAppEntry != null && sender is Button target)
        {
            if (_siteAppMenuPopup != null)
                _siteAppMenuPopup.IsOpen = false;

            _siteAppMenuPopup = CreateSiteAppMenuPopup(_siteAppEntry, target);
            _siteAppMenuPopup.IsOpen = true;
            return;
        }

        bool opening = SidePanel.Visibility != Visibility.Visible;
        SidePanel.Visibility = opening ? Visibility.Visible : Visibility.Collapsed;
        PanelColumn.Width = opening ? new GridLength(390) : new GridLength(0);
        if (opening) ShowBookmarksPanel();
    }

    private void Accounts_StateChanged(object? sender, EventArgs e)
        => _ = Dispatcher.InvokeAsync(RenderAccountUi);

    private void ProfileButton_Click(object sender, RoutedEventArgs e)
    {
        RenderAccountUi();
        ProfilePopup.IsOpen = !ProfilePopup.IsOpen;
    }

    private void OpenAccountWindow_Click(object sender, RoutedEventArgs e)
    {
        ProfilePopup.IsOpen = false;
        new AccountWindow(App.Accounts, _settings, _isPrivateWindow) { Owner = this }.ShowDialog();
        RenderAccountUi();
    }

    private async void ProfileSignOut_Click(object sender, RoutedEventArgs e)
    {
        ProfilePopup.IsOpen = false;
        if (MessageBox.Show(
                "Odhlásit účet YamaSearch na tomto zařízení? Místní data prohlížeče zůstanou zachována.",
                "YamaSearch",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question) != MessageBoxResult.Yes)
            return;

        try { await App.Accounts.SignOutAsync(); }
        catch
        {
            MessageBox.Show("Odhlášení se nepodařilo bezpečně dokončit.", "YamaSearch", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private void RenderAccountUi()
    {
        if (_isPrivateWindow || _siteAppMode)
        {
            ProfileButton.Visibility = Visibility.Collapsed;
            ProfilePopup.IsOpen = false;
            return;
        }

        ProfileButton.Visibility = Visibility.Visible;
        var snapshot = App.Accounts.Snapshot;
        ProfileButton.ToolTip = snapshot.IsSignedIn
            ? $"Účet YamaSearch · {snapshot.DisplayName}"
            : "Účet YamaSearch · nepřihlášeno";
        ProfilePopupName.Text = snapshot.DisplayName;
        ProfilePopupEmail.Text = snapshot.Email;
        ProfilePopupStatus.Text = snapshot.StatusText;
        ProfileSignInButton.Visibility = snapshot.IsSignedIn ? Visibility.Collapsed : Visibility.Visible;
        ProfileManageButton.Visibility = snapshot.IsSignedIn ? Visibility.Visible : Visibility.Collapsed;
        ProfileLinkedButton.Visibility = snapshot.IsSignedIn ? Visibility.Visible : Visibility.Collapsed;
        ProfileSyncButton.Visibility = snapshot.IsSignedIn ? Visibility.Visible : Visibility.Collapsed;
        ProfileSignOutButton.Visibility = snapshot.IsSignedIn ? Visibility.Visible : Visibility.Collapsed;
        ProfileSignInButton.Content = snapshot.IsConfigured ? "Přihlásit se" : "Nastavení účtu";
        _ = SetProfileAvatarAsync(snapshot.AvatarUrl);
    }

    private async Task SetProfileAvatarAsync(string url)
    {
        var version = ++_profileAvatarVersion;
        ProfileAvatarImage.Visibility = Visibility.Collapsed;
        ProfilePopupAvatarImage.Visibility = Visibility.Collapsed;
        ProfileAvatarBrush.ImageSource = null;
        ProfilePopupAvatarBrush.ImageSource = null;
        if (string.IsNullOrWhiteSpace(url)) return;

        var image = await AvatarImageLoader.LoadAsync(url);
        if (version != _profileAvatarVersion || image is null || _isClosing) return;
        await Dispatcher.InvokeAsync(() =>
        {
            ProfileAvatarBrush.ImageSource = image;
            ProfilePopupAvatarBrush.ImageSource = image;
            ProfileAvatarImage.Visibility = Visibility.Visible;
            ProfilePopupAvatarImage.Visibility = Visibility.Visible;
        });
    }
    private void BookmarksPanel_Click(object sender, RoutedEventArgs e)
    {
        ShowBookmarksPanel();
        ScrollSidePanelToContent();
    }

    private void HistoryPanel_Click(object sender, RoutedEventArgs e)
    {
        ShowHistoryPanel();
        ScrollSidePanelToContent();
    }

    private void DownloadsPanel_Click(object sender, RoutedEventArgs e)
    {
        // V bočním menu je Stahování samostatný nástroj. Otevřeme proto rovnou
        // vlastní okno historie stahování místo vykreslování obsahu až pod menu,
        // kde mohl zůstat mimo viditelnou oblast.
        DownloadPopup.IsOpen = false;
        var window = new DownloadsWindow(_settings, OnDownloadsChanged) { Owner = this };
        window.Show();
    }

    private void ScrollSidePanelToContent()
    {
        _ = Dispatcher.BeginInvoke(
            System.Windows.Threading.DispatcherPriority.Loaded,
            new Action(() =>
            {
                PanelTitle.UpdateLayout();
                PanelTitle.BringIntoView();
            }));
    }
    private void Settings_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SettingsWindow(_settings, _active?.View.CoreWebView2?.Profile, App.Accounts, _isPrivateWindow) { Owner = this };
        if (dialog.ShowDialog() != true) return;

        _settings.Save();
        foreach (var tab in _tabs.Where(x => x.View.CoreWebView2 != null))
        {
            tab.View.CoreWebView2.Settings.IsPasswordAutosaveEnabled = !_isPrivateWindow && _settings.Data.OfferPasswordSave;
            tab.View.CoreWebView2.Settings.IsGeneralAutofillEnabled = !_isPrivateWindow && _settings.Data.EnableGeneralAutofill;
        }
        StatusText.Text = "Nastavení bylo uloženo";

        if (!dialog.RestartRequired) return;

        var restart = MessageBox.Show(
            "Změna hardwarové akcelerace se projeví až po restartu YamaSearch.\n\nRestartovat nyní?",
            "YamaSearch",
            MessageBoxButton.YesNo,
            MessageBoxImage.Information);

        if (restart == MessageBoxResult.Yes)
            RestartApplication();
    }

    private void NewWindow_Click(object sender, RoutedEventArgs e)
        => StartYamaSearchProcess();

    private void NewPrivateWindow_Click(object sender, RoutedEventArgs e)
        => StartYamaSearchProcess("--private");

    private async void FindOnPage_Click(object sender, RoutedEventArgs e)
    {
        if (_active?.View.CoreWebView2 == null) return;

        var dialog = new FindWindow(_lastFindQuery) { Owner = this };
        if (dialog.ShowDialog() != true) return;

        _lastFindQuery = dialog.Query;
        var serialized = JsonSerializer.Serialize(_lastFindQuery);
        try
        {
            var result = await _active.View.CoreWebView2.ExecuteScriptAsync(
                $"window.find({serialized}, false, false, true, false, false, false)");
            StatusText.Text = result.Equals("true", StringComparison.OrdinalIgnoreCase)
                ? $"Nalezeno: {_lastFindQuery}"
                : $"Text nenalezen: {_lastFindQuery}";
        }
        catch (Exception error)
        {
            StatusText.Text = "Hledání na stránce se nepodařilo: " + error.Message;
        }
    }

    private void PrintPage_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            _active?.View.CoreWebView2?.ShowPrintUI(CoreWebView2PrintDialogKind.Browser);
        }
        catch (Exception error)
        {
            MessageBox.Show("Tisk se nepodařilo otevřít.\n\n" + error.Message, "YamaSearch", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void CreateSiteApp_Click(object sender, RoutedEventArgs e)
    {
        if (_active?.View.CoreWebView2 == null
            || !Uri.TryCreate(_active.View.CoreWebView2.Source, UriKind.Absolute, out var uri)
            || uri.Scheme is not ("http" or "https"))
        {
            MessageBox.Show("Nejdřív otevři webovou stránku, ze které chceš vytvořit aplikaci.", "YamaSearch");
            return;
        }

        var existing = _settings.Data.InstalledApps.FirstOrDefault(x =>
            Uri.TryCreate(x.Url, UriKind.Absolute, out var installedUri)
            && string.Equals(installedUri.Host, uri.Host, StringComparison.OrdinalIgnoreCase));

        if (existing != null)
        {
            var manager = new AppsWindow(_settings, existing.Id) { Owner = this };
            manager.Show();
            return;
        }

        var rawTitle = string.IsNullOrWhiteSpace(_active.View.CoreWebView2.DocumentTitle)
            ? uri.Host.Replace("www.", "", StringComparison.OrdinalIgnoreCase)
            : _active.View.CoreWebView2.DocumentTitle.Trim();

        var title = rawTitle;
        foreach (var separator in new[] { " | ", " - ", " — " })
        {
            var index = title.IndexOf(separator, StringComparison.Ordinal);
            if (index > 2)
            {
                title = title[..index].Trim();
                break;
            }
        }
        if (title.Length > 70) title = title[..70];

        var pageIconUrl = ResolveSiteAppIconUrl(uri, _active.View.CoreWebView2.FaviconUri);
        var previewIcon = _active.Favicon ?? TryLoadRemoteOrFallbackIcon(pageIconUrl);
        var installDialog = new SiteAppInstallWindow(title, uri.Host, previewIcon) { Owner = this };
        if (installDialog.ShowDialog() != true)
            return;

        var app = new SiteAppEntry
        {
            Id = Guid.NewGuid().ToString("N"),
            Name = title,
            Url = uri.ToString(),
            Host = uri.Host,
            FaviconUrl = pageIconUrl,
            InstalledAt = DateTimeOffset.Now,
            AddToStartMenu = installDialog.AddToStartMenu,
            CreateDesktopShortcut = installDialog.CreateDesktopShortcut,
            StartOnLogin = installDialog.StartOnLogin
        };

        try
        {
            await SiteAppServices.PrepareIconAsync(app, app.FaviconUrl);
            SiteAppServices.ApplyShortcuts(app);
            _settings.Data.InstalledApps.Add(app);
            _settings.Save();

            var taskbarPinFailed = false;
            if (installDialog.RequestTaskbarPin && !SiteAppServices.TryPinToTaskbar(app))
            {
                taskbarPinFailed = true;
                SiteAppServices.OpenShortcutLocation(app);
            }

            var installedIcon = TryLoadLocalIcon(app.IconPath)
                ?? new BitmapImage(new Uri("pack://application:,,,/Assets/YamaSearch-symbol-64.png"));
            var installed = new SiteAppInstalledWindow(app, installedIcon, taskbarPinFailed) { Owner = this };
            installed.ShowDialog();

            if (installed.SettingsRequested)
                StartYamaSearchProcess($"--manage-app={app.Id}");
            else if (installed.OpenRequested)
                StartYamaSearchProcess($"--app-id={app.Id}");
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "Aplikaci stránky se nepodařilo nainstalovat.\n\n" + error.Message,
                "YamaSearch",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private void ManageApps_Click(object sender, RoutedEventArgs e)
    {
        var manager = new AppsWindow(_settings) { Owner = this };
        manager.Show();
    }

    private void ApplySiteAppMode()
    {
        if (Content is not Grid root || root.RowDefinitions.Count < 5) return;

        Title = _siteAppEntry?.Name ?? "YamaSearch App";
        if (_siteAppEntry != null)
        {
            var icon = TryLoadLocalIcon(_siteAppEntry.IconPath);
            if (icon != null) Icon = icon;
        }

        TabsScroller.Visibility = Visibility.Collapsed;
        ProfileButton.Visibility = Visibility.Collapsed;
        ProfilePopup.IsOpen = false;
        root.RowDefinitions[1].Height = new GridLength(0);
        root.RowDefinitions[2].Height = new GridLength(0);
        root.RowDefinitions[4].Height = new GridLength(0);
        FavoritesBar.Visibility = Visibility.Collapsed;
        SidePanel.Visibility = Visibility.Collapsed;
        PanelColumn.Width = new GridLength(0);
    }

    private System.Windows.Controls.Primitives.Popup CreateSiteAppMenuPopup(SiteAppEntry app, Button target)
    {
        var popup = new System.Windows.Controls.Primitives.Popup
        {
            PlacementTarget = target,
            Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom,
            StaysOpen = false,
            AllowsTransparency = true,
            PopupAnimation = System.Windows.Controls.Primitives.PopupAnimation.Slide
        };

        var panel = new StackPanel { Margin = new Thickness(5) };
        void AddAction(string label, Action action, bool danger = false)
        {
            var button = new Button
            {
                Content = label,
                HorizontalContentAlignment = HorizontalAlignment.Left,
                Padding = new Thickness(14, 9, 24, 9),
                Margin = new Thickness(0, 2, 0, 2),
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(danger ? "#3A202B" : "#14243A")),
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(danger ? "#FFB7C5" : "#EAF3FF"))
            };
            button.Click += (_, _) =>
            {
                popup.IsOpen = false;
                action();
            };
            panel.Children.Add(button);
        }

        panel.Children.Add(new TextBlock
        {
            Text = "Informace o aplikaci",
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#8FA4BE")),
            FontSize = 11,
            Margin = new Thickness(10, 6, 10, 4)
        });

        AddAction($"⚙  Nastavení aplikace {app.Name}", () => StartYamaSearchProcess($"--manage-app={app.Id}"));
        AddAction(app.AddToStartMenu ? "Odebrat z nabídky Start" : "Přidat do nabídky Start", () => ToggleStartMenu(app));
        AddAction("Připnout na hlavní panel", () => PinSiteAppToTaskbar(app));
        AddAction(app.CreateDesktopShortcut ? "Odebrat zástupce z plochy" : "Vytvořit zástupce na ploše", () => ToggleDesktopShortcut(app));
        AddAction(app.StartOnLogin ? "Vypnout automatické spuštění" : "Automaticky spouštět při přihlášení", () => ToggleStartup(app));
        AddAction("Otevřít v YamaSearch", () => StartYamaSearchProcess($"--url={app.Url}"));

        panel.Children.Add(new Border
        {
            Height = 1,
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#31537D")),
            Margin = new Thickness(7, 6, 7, 6)
        });
        AddAction("Odinstalovat aplikaci", () => UninstallCurrentSiteApp(app), danger: true);

        popup.Child = new Border
        {
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#101D30")),
            BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#38D9FF")),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            Child = panel,
            MinWidth = 280,
            Padding = new Thickness(3),
            Effect = new System.Windows.Media.Effects.DropShadowEffect
            {
                Color = Colors.Black,
                Opacity = .55,
                BlurRadius = 18,
                ShadowDepth = 6
            }
        };
        return popup;
    }

    private void ToggleStartMenu(SiteAppEntry app)
    {
        app.AddToStartMenu = !app.AddToStartMenu;
        try
        {
            SiteAppServices.ApplyShortcuts(app);
            _settings.Save();
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "YamaSearch");
        }
    }

    private void ToggleDesktopShortcut(SiteAppEntry app)
    {
        app.CreateDesktopShortcut = !app.CreateDesktopShortcut;
        try
        {
            SiteAppServices.ApplyShortcuts(app);
            _settings.Save();
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "YamaSearch");
        }
    }

    private void ToggleStartup(SiteAppEntry app)
    {
        app.StartOnLogin = !app.StartOnLogin;
        try
        {
            SiteAppServices.ApplyShortcuts(app);
            _settings.Save();
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "YamaSearch");
        }
    }

    private void PinSiteAppToTaskbar(SiteAppEntry app)
    {
        if (SiteAppServices.TryPinToTaskbar(app))
        {
            _settings.Save();
            return;
        }

        SiteAppServices.OpenShortcutLocation(app);
        _settings.Save();
        MessageBox.Show(
            "Windows nepovolil automatické připnutí na hlavní panel. Otevřel jsem umístění zástupce — klikni na něj pravým tlačítkem a zvol Připnout na hlavní panel.",
            "YamaSearch",
            MessageBoxButton.OK,
            MessageBoxImage.Information);
    }

    private void UninstallCurrentSiteApp(SiteAppEntry app)
    {
        if (MessageBox.Show(
            $"Odinstalovat aplikaci „{app.Name}“?\n\nPřihlášení a data webu v YamaSearch tím nebudou smazána.",
            "YamaSearch",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning) != MessageBoxResult.Yes) return;

        SiteAppServices.RemoveAppFiles(app);
        _settings.Data.InstalledApps.Remove(app);
        _settings.Save();
        Close();
    }

    private static string ResolveSiteAppIconUrl(Uri page, string? faviconUrl)
    {
        if (Uri.TryCreate(faviconUrl, UriKind.Absolute, out var favicon)
            && favicon.Scheme is "http" or "https")
            return favicon.ToString();

        return page.GetLeftPart(UriPartial.Authority) + "/favicon.ico";
    }

    private static ImageSource TryLoadRemoteOrFallbackIcon(string? faviconUrl)
    {
        try
        {
            if (Uri.TryCreate(faviconUrl, UriKind.Absolute, out var uri))
                return new BitmapImage(uri);
        }
        catch { }

        return new BitmapImage(new Uri("pack://application:,,,/Assets/YamaSearch-symbol-64.png"));
    }

    private static BitmapImage? TryLoadLocalIcon(string? path)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) return null;
            var image = new BitmapImage();
            image.BeginInit();
            image.CacheOption = BitmapCacheOption.OnLoad;
            image.UriSource = new Uri(path, UriKind.Absolute);
            image.EndInit();
            image.Freeze();
            return image;
        }
        catch
        {
            return null;
        }
    }

    private void RestartApplication()
    {
        var current = _active?.View.CoreWebView2?.Source;
        if (_siteAppMode && !string.IsNullOrWhiteSpace(_siteAppId))
            StartYamaSearchProcess($"--app-id={_siteAppId}");
        else if (_siteAppMode && !string.IsNullOrWhiteSpace(current))
            StartYamaSearchProcess($"--app={current}");
        else if (!string.IsNullOrWhiteSpace(current))
            StartYamaSearchProcess($"--url={current}");
        else
            StartYamaSearchProcess();

        Application.Current.Shutdown();
    }

    private static void StartYamaSearchProcess(params string[] arguments)
    {
        var executable = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(executable)) return;

        var start = new ProcessStartInfo(executable) { UseShellExecute = true };
        foreach (var argument in arguments)
            start.ArgumentList.Add(argument);
        Process.Start(start);
    }
    private void ShowBookmarksPanel()
    {
        PanelTitle.Text = "☆  Oblíbené"; PanelList.Items.Clear();

        if (_active?.View.CoreWebView2 != null && !_active.IsYamaNewTab && TryNormalizeFavoriteUrl(_active.View.CoreWebView2.Source, out var currentUrl))
        {
            var currentIsFavorite = FindFavoriteIndex(currentUrl) >= 0;
            var currentButton = new Button
            {
                Content = currentIsFavorite ? "★  Odebrat aktuální stránku" : "☆  Přidat aktuální stránku",
                HorizontalContentAlignment = HorizontalAlignment.Left,
                Style = (Style)FindResource(currentIsFavorite ? "SideDangerButton" : "SideNavButton"),
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(currentIsFavorite ? "#41212D" : "#17334A")),
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
    private void ShowDownloadsPanel()
    {
        PanelTitle.Text = "⇩  Stahování";
        PanelList.Items.Clear();

        if (_settings.Data.Downloads.Count == 0)
        {
            PanelList.Items.Add(new TextBlock
            {
                Text = "Zatím nebyly staženy žádné soubory.",
                Foreground = (Brush)FindResource("MutedBrush"),
                TextWrapping = TextWrapping.Wrap
            });
        }
        else
        {
            foreach (var entry in _settings.Data.Downloads.Take(20).ToList())
                PanelList.Items.Add(CreateDownloadPanelItem(entry));
        }

        var showAll = new Button
        {
            Content = "Zobrazit celou historii stahování",
            HorizontalContentAlignment = HorizontalAlignment.Center,
            Style = (Style)FindResource("SideNavButton"),
            Margin = new Thickness(0, 10, 0, 0)
        };
        showAll.Click += ShowAllDownloads_Click;
        PanelList.Items.Add(showAll);
    }

    private FrameworkElement CreateDownloadPanelItem(DownloadEntry entry)
    {
        var row = new Grid { Margin = new Thickness(0, 2, 0, 2) };
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(28) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        row.Children.Add(new TextBlock
        {
            Text = entry.State == "Dokončeno" ? "✓" : entry.State == "Přerušeno" ? "!" : "⇩",
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(entry.State == "Dokončeno" ? "#4ADE80" : entry.State == "Přerušeno" ? "#FCA5A5" : "#54D7F8")),
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center,
            FontSize = 16
        });

        var info = new StackPanel();
        info.Children.Add(new TextBlock { Text = entry.FileName, Foreground = Brushes.White, TextTrimming = TextTrimming.CharacterEllipsis });
        var progress = entry.TotalBytes > 0 ? Math.Clamp((double)entry.BytesReceived / entry.TotalBytes, 0, 1) : 0;
        info.Children.Add(new TextBlock
        {
            Text = entry.State == "Probíhá"
                ? (entry.TotalBytes > 0 ? $"{progress:P0} · {FormatBytes(entry.BytesReceived)} / {FormatBytes(entry.TotalBytes)}" : $"{FormatBytes(entry.BytesReceived)} staženo")
                : $"{entry.State} · {entry.StartedAt:dd.MM. HH:mm}",
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#91A8C2")),
            FontSize = 10,
            Margin = new Thickness(0, 2, 0, 0),
            TextTrimming = TextTrimming.CharacterEllipsis
        });
        Grid.SetColumn(info, 1);
        row.Children.Add(info);

        var button = new Button
        {
            Content = row,
            ToolTip = entry.FilePath,
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            Padding = new Thickness(8),
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#132238"))
        };
        button.Click += (_, _) => { if (entry.State == "Dokončeno") OpenDownloadedFile(entry); };
        return button;
    }

    private void ShowHistoryPanel()
    {
        PanelTitle.Text = "◷  Historie";
        PanelList.Items.Clear();

        var showAll = new Button
        {
            Content = "Zobrazit celou historii",
            Style = (Style)FindResource("SideNavButton"),
            HorizontalContentAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 8)
        };
        showAll.Click += ShowAllHistory_Click;
        PanelList.Items.Add(showAll);

        var clearAll = new Button
        {
            Content = "🗑  Vymazat celou historii",
            ToolTip = "Odstraní všechny uložené položky historie",
            Style = (Style)FindResource("SideDangerButton"),
            Margin = new Thickness(0, 0, 0, 12)
        };
        clearAll.Click += (_, _) =>
        {
            if (MessageBox.Show(
                "Opravdu chceš vymazat celou historii YamaSearch?",
                "Vymazat historii",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning) != MessageBoxResult.Yes) return;

            _settings.Data.History.Clear();
            _settings.Save();
            StatusText.Text = "Historie byla vymazána";
            RefreshFavoriteViews();
            ShowHistoryPanel();
        };
        PanelList.Items.Add(clearAll);

        if (_settings.Data.History.Count == 0)
        {
            PanelList.Items.Add(new TextBlock
            {
                Text = "Historie je zatím prázdná.",
                Foreground = (Brush)FindResource("MutedBrush"),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(4, 8, 4, 0)
            });
            return;
        }

        foreach (var item in _settings.Data.History.Take(50).ToList())
            PanelList.Items.Add(CreateHistoryPanelItem(item));
    }

    private FrameworkElement CreateHistoryPanelItem(HistoryEntry entry)
    {
        var row = new Grid { Margin = new Thickness(0, 2, 0, 2) };
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var content = new Grid();
        content.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(34) });
        content.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var iconHost = new Grid { Width = 22, Height = 22, VerticalAlignment = VerticalAlignment.Center };
        iconHost.Children.Add(new TextBlock
        {
            Text = "◉",
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#76DFFF")),
            FontSize = 15,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        });

        if (Uri.TryCreate(entry.FaviconUrl, UriKind.Absolute, out var favicon))
        {
            try
            {
                var image = new Image { Source = new BitmapImage(favicon), Width = 18, Height = 18, Stretch = Stretch.Uniform };
                image.ImageFailed += (_, _) => image.Visibility = Visibility.Collapsed;
                iconHost.Children.Add(image);
            }
            catch { }
        }

        content.Children.Add(iconHost);

        var text = new StackPanel();
        var label = string.IsNullOrWhiteSpace(entry.Title) ? entry.Url : entry.Title;
        text.Children.Add(new TextBlock
        {
            Text = label,
            Foreground = Brushes.White,
            FontWeight = FontWeights.SemiBold,
            TextTrimming = TextTrimming.CharacterEllipsis
        });
        text.Children.Add(new TextBlock
        {
            Text = entry.Url,
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#8FB0CF")),
            FontSize = 10,
            Margin = new Thickness(0, 2, 0, 0),
            TextTrimming = TextTrimming.CharacterEllipsis
        });
        Grid.SetColumn(text, 1);
        content.Children.Add(text);

        var open = new Button
        {
            Content = content,
            ToolTip = entry.Url,
            Style = (Style)FindResource("SideContentButton")
        };
        open.Click += (_, _) => { if (_active != null) _ = NavigateAsync(_active, entry.Url); };
        row.Children.Add(open);

        var remove = new Button
        {
            Content = "×",
            ToolTip = "Smazat tuto položku z historie",
            Style = (Style)FindResource("SideDeleteButton"),
            Margin = new Thickness(6, 3, 0, 3)
        };
        Grid.SetColumn(remove, 1);
        remove.Click += (_, _) =>
        {
            _settings.Data.History.Remove(entry);
            _settings.Save();
            StatusText.Text = "Položka byla odstraněna z historie";
            RefreshFavoriteViews();
            ShowHistoryPanel();
        };
        row.Children.Add(remove);
        return row;
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

        var content = new Grid();
        content.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(34) });
        content.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var iconHost = new Grid { Width = 22, Height = 22, VerticalAlignment = VerticalAlignment.Center };
        iconHost.Children.Add(new TextBlock
        {
            Text = "☆",
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#76DFFF")),
            FontSize = 17,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        });

        var faviconUrl = history?.FaviconUrl;
        if (string.IsNullOrWhiteSpace(faviconUrl) && Uri.TryCreate(url, UriKind.Absolute, out var favoriteUri))
            faviconUrl = $"{favoriteUri.Scheme}://{favoriteUri.Host}/favicon.ico";

        if (Uri.TryCreate(faviconUrl, UriKind.Absolute, out var favicon))
        {
            try
            {
                var image = new Image { Source = new BitmapImage(favicon), Width = 18, Height = 18, Stretch = Stretch.Uniform };
                image.ImageFailed += (_, _) => image.Visibility = Visibility.Collapsed;
                iconHost.Children.Add(image);
            }
            catch { }
        }

        content.Children.Add(iconHost);

        var text = new StackPanel();
        text.Children.Add(new TextBlock
        {
            Text = label,
            Foreground = Brushes.White,
            FontWeight = FontWeights.SemiBold,
            TextTrimming = TextTrimming.CharacterEllipsis
        });
        text.Children.Add(new TextBlock
        {
            Text = url,
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#8FB0CF")),
            FontSize = 10,
            Margin = new Thickness(0, 2, 0, 0),
            TextTrimming = TextTrimming.CharacterEllipsis
        });
        Grid.SetColumn(text, 1);
        content.Children.Add(text);

        var open = new Button
        {
            Content = content,
            ToolTip = url,
            Style = (Style)FindResource("SideContentButton")
        };
        open.Click += (_, _) => { if (_active != null) _ = NavigateAsync(_active, url); };
        row.Children.Add(open);

        var remove = new Button
        {
            Content = "×",
            ToolTip = "Odebrat z oblíbených",
            Style = (Style)FindResource("SideDeleteButton"),
            Margin = new Thickness(6, 3, 0, 3)
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
        try
        {
            var json = e.TryGetWebMessageAsString();
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (!root.TryGetProperty("action", out var actionElement)) return;

            var action = actionElement.GetString();
            if (string.Equals(action, "yamaBlockLog", StringComparison.Ordinal))
            {
                var status = root.TryGetProperty("status", out var statusElement)
                    ? statusElement.GetString() ?? "INFO"
                    : "INFO";
                var category = root.TryGetProperty("category", out var categoryElement)
                    ? categoryElement.GetString() ?? "YouTube"
                    : "YouTube";
                var detail = root.TryGetProperty("detail", out var detailElement)
                    ? detailElement.GetString() ?? ""
                    : "";

                YamaBlockDiagnostics.Add(status, category, detail);
                return;
            }

            if (string.Equals(action, "siteMediaUsage", StringComparison.Ordinal))
            {
                HandleMediaUsageMessage(tab, root);
                return;
            }

            if (string.Equals(action, "tabTitleChanged", StringComparison.Ordinal)
                && root.TryGetProperty("title", out var titleElement)
                && titleElement.ValueKind == JsonValueKind.String)
            {
                UpdateTabTitle(tab, titleElement.GetString());
                return;
            }

            if (!tab.IsYamaNewTab) return;

            if (string.Equals(action, "reorderFavorites", StringComparison.Ordinal)
                && root.TryGetProperty("urls", out var urlsElement)
                && urlsElement.ValueKind == JsonValueKind.Array)
            {
                ReorderFavorites(urlsElement.EnumerateArray()
                    .Where(x => x.ValueKind == JsonValueKind.String)
                    .Select(x => x.GetString() ?? ""));
                return;
            }

            if (!root.TryGetProperty("url", out var urlElement)) return;

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
                RemoveFavorite(url);
        }
        catch (Exception error)
        {
            Debug.WriteLine("WebView message failed: " + error.Message);
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

    private void ReorderFavorites(IEnumerable<string> urls)
    {
        var remaining = _settings.Data.Bookmarks.ToList();
        var reordered = new List<string>();
        foreach (var url in urls)
        {
            var index = remaining.FindIndex(existing => SameFavorite(existing, url));
            if (index < 0) continue;
            reordered.Add(remaining[index]);
            remaining.RemoveAt(index);
        }

        if (reordered.Count == 0) return;
        reordered.AddRange(remaining);
        _settings.Data.Bookmarks = reordered;
        _settings.Save();
        StatusText.Text = "Pořadí oblíbených bylo uloženo";
        RefreshFavoriteViews();
    }

    private void RefreshFavoriteViews()
    {
        foreach (var tab in _tabs.Where(x => x.IsYamaNewTab && x.View.CoreWebView2 != null).ToList())
            tab.View.CoreWebView2.NavigateToString(CreateNewTabHtml());

        if (SidePanel.Visibility == Visibility.Visible && PanelTitle.Text == "Oblíbené")
            ShowBookmarksPanel();

        RenderFavoritesBar();
        if (FavoritesQuickPopup.IsOpen) UpdateFavoritesPopupState();
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
        if (HistoryQuickPopup.IsOpen) RenderHistoryQuickPopup();
    }

    private void CleanupPrivateWebData()
    {
        foreach (var tab in _tabs.ToList())
        {
            _tabs.Remove(tab);
            DisposeBrowserTab(tab);
        }
    }
    private async void BlockButton_Click(object sender, RoutedEventArgs e)
    {
        var page = _active?.View.CoreWebView2?.Source;
        var dialog = new BlockWindow(_settings, page) { Owner = this };
        if (dialog.ShowDialog() != true) return;

        _settings.Save();
        UpdateBlockButton();
        await ApplyYamaBlockToAllTabsAsync();

        if (_active != null)
        {
            var host = GetPageHost(_active);
            BlockedText.Text = !string.IsNullOrWhiteSpace(host) && IsWhitelisted(host)
                ? "YamaBlock · výjimka pro tento web"
                : $"YamaBlock · {_active.BlockedCount} blokováno";
        }

        StatusText.Text = $"YamaBlock: {_settings.Data.BlockMode.ToLabel()}";
    }

    private void UpdateShieldButton()
    {
        var level = _settings.Data.SecurityLevel;
        var label = level switch
        {
            SecurityLevel.Strict => "Přísná",
            SecurityLevel.Custom => "Vlastní",
            _ => "Doporučená"
        };
        ShieldButton.ToolTip = $"YamaShield · {label} — kliknutím zobrazíš nastavení";
        ShieldButton.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(level switch
        {
            SecurityLevel.Strict => "#67E8F9",
            SecurityLevel.Custom => "#A78BFA",
            _ => "#54D7F8"
        }));
        ShieldButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#10243A"));
        ShieldButton.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(level == SecurityLevel.Custom ? "#7654D6" : "#2F7EAA"));
    }

    private void UpdateBlockButton()
    {
        var mode = _settings.Data.BlockMode;
        BlockButton.ToolTip = $"YamaBlock · {mode.ToLabel()} — kliknutím otevřeš nastavení";
        BlockButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(mode switch
        {
            BlockMode.Strict => "#3B2811",
            BlockMode.Off => "#202B3B",
            _ => "#2B2410"
        }));
        BlockButton.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(mode switch
        {
            BlockMode.Strict => "#F59E0B",
            BlockMode.Off => "#52657F",
            _ => "#B98215"
        }));
        BlockButton.BorderThickness = new Thickness(1);
        BlockButton.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(mode switch
        {
            BlockMode.Strict => "#FBBF24",
            BlockMode.Off => "#8FA4BE",
            _ => "#FCD34D"
        }));
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
            UpdateShieldButton();
            UpdateBlockButton();
            StatusText.Text = $"YamaShield: {(_settings.Data.SecurityLevel == SecurityLevel.Strict ? "Přísná" : _settings.Data.SecurityLevel == SecurityLevel.Custom ? "Vlastní" : "Doporučená")}";
        }
    }

    private void HandleMediaUsageMessage(BrowserTab tab, JsonElement root)
    {
        if (!ReferenceEquals(tab.Owner, this) || !_tabs.Contains(tab)) return;
        if (!root.TryGetProperty("bridgeToken", out var tokenElement)
            || tokenElement.ValueKind != JsonValueKind.String
            || !string.Equals(tokenElement.GetString(), tab.MediaUsageBridgeToken, StringComparison.Ordinal)) return;

        var core = tab.View.CoreWebView2;
        if (core is null
            || !root.TryGetProperty("topOrigin", out var topOriginElement)
            || topOriginElement.ValueKind != JsonValueKind.String
            || !PermissionLabels.SameOrigin(topOriginElement.GetString(), core.Source)) return;

        if (!root.TryGetProperty("origin", out var originElement)
            || originElement.ValueKind != JsonValueKind.String
            || !PermissionLabels.TryGetOrigin(originElement.GetString(), out var origin)) return;
        if (!root.TryGetProperty("mediaKind", out var mediaKindElement)
            || mediaKindElement.ValueKind != JsonValueKind.String) return;

        var kind = mediaKindElement.GetString() switch
        {
            "microphone" => CoreWebView2PermissionKind.Microphone,
            "camera" => CoreWebView2PermissionKind.Camera,
            _ => (CoreWebView2PermissionKind?)null
        };
        if (kind is null) return;

        var phase = root.TryGetProperty("phase", out var phaseElement) && phaseElement.ValueKind == JsonValueKind.String
            ? phaseElement.GetString() ?? string.Empty
            : string.Empty;
        var requestId = root.TryGetProperty("requestId", out var requestElement) && requestElement.ValueKind == JsonValueKind.String
            ? requestElement.GetString() ?? string.Empty
            : string.Empty;
        var trackId = root.TryGetProperty("trackId", out var trackElement) && trackElement.ValueKind == JsonValueKind.String
            ? trackElement.GetString() ?? string.Empty
            : string.Empty;

        var activity = tab.PermissionActivities.FirstOrDefault(entry => entry.Kind == kind.Value
            && PermissionLabels.SameOrigin(entry.Origin, origin));
        if (activity is null)
        {
            // A request message is always posted before its active/error result.
            // Ignoring orphaned results prevents a just-destroyed same-origin
            // document from recreating stale media state after navigation.
            if (!string.Equals(phase, "request", StringComparison.Ordinal)) return;
            activity = new SitePermissionActivity(kind.Value, origin);
            tab.PermissionActivities.Add(activity);
        }

        switch (phase)
        {
            case "request":
                if (!string.IsNullOrWhiteSpace(requestId)) activity.PendingMediaRequestIds.Add(requestId);
                activity.MediaErrorName = null;
                break;
            case "active":
                if (!string.IsNullOrWhiteSpace(requestId)) activity.PendingMediaRequestIds.Remove(requestId);
                if (!string.IsNullOrWhiteSpace(trackId)) activity.ActiveMediaTrackIds.Add(trackId);
                activity.WasMediaUsed = true;
                activity.MediaErrorName = null;
                _ = SyncPermissionActivitiesFromProfileAsync(tab);
                break;
            case "error":
                if (!string.IsNullOrWhiteSpace(requestId)) activity.PendingMediaRequestIds.Remove(requestId);
                activity.MediaErrorName = root.TryGetProperty("errorName", out var errorElement)
                    && errorElement.ValueKind == JsonValueKind.String
                    ? errorElement.GetString()
                    : "Error";
                break;
            case "ended":
                if (!string.IsNullOrWhiteSpace(requestId)) activity.PendingMediaRequestIds.Remove(requestId);
                if (!string.IsNullOrWhiteSpace(trackId)) activity.ActiveMediaTrackIds.Remove(trackId);
                activity.WasMediaUsed = true;
                break;
            default:
                return;
        }

        activity.UpdatedAt = DateTimeOffset.Now;
        RefreshPermissionPresentation(tab);
    }

    private async Task SyncPermissionActivitiesFromProfileAsync(BrowserTab tab)
    {
        var core = tab.View.CoreWebView2;
        if (core is null || !PermissionLabels.TryGetOrigin(core.Source, out var currentOrigin)) return;

        var navigationGeneration = tab.NavigationGeneration;
        var syncVersion = ++tab.PermissionSyncVersion;
        IReadOnlyList<CoreWebView2PermissionSetting> settings;
        try { settings = await core.Profile.GetNonDefaultPermissionSettingsAsync(); }
        catch (Exception error)
        {
            Debug.WriteLine("Nepodařilo se načíst uložená oprávnění webu: " + error.Message);
            return;
        }

        if (!ReferenceEquals(tab.Owner, this)
            || !_tabs.Contains(tab)
            || !ReferenceEquals(tab.View.CoreWebView2, core)
            || tab.NavigationGeneration != navigationGeneration
            || tab.PermissionSyncVersion != syncVersion
            || !PermissionLabels.SameOrigin(core.Source, currentOrigin)) return;

        var relatedOrigins = tab.PermissionActivities
            .Select(activity => PermissionLabels.NormalizeOrigin(activity.Origin))
            .Append(currentOrigin)
            .Where(origin => !string.IsNullOrWhiteSpace(origin))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var relevantSettings = settings
            .Where(setting => relatedOrigins.Any(origin => PermissionLabels.SameOrigin(origin, setting.PermissionOrigin)))
            .ToArray();

        foreach (var activity in tab.PermissionActivities.Where(activity => !activity.IsPending))
        {
            var stored = relevantSettings.FirstOrDefault(setting => setting.PermissionKind == activity.Kind
                && PermissionLabels.SameOrigin(setting.PermissionOrigin, activity.Origin));
            if (stored is not null)
            {
                activity.State = stored.PermissionState;
                activity.IsSessionOnly = _isPrivateWindow;
                activity.BlockedByGlobalRule = false;
            }
            else if (!activity.BlockedByGlobalRule
                && activity.State is CoreWebView2PermissionState.Allow or CoreWebView2PermissionState.Deny)
            {
                activity.State = CoreWebView2PermissionState.Default;
                activity.IsSessionOnly = false;
            }
        }

        foreach (var setting in relevantSettings)
        {
            UpdatePermissionActivity(tab, setting.PermissionKind, PermissionLabels.NormalizeOrigin(setting.PermissionOrigin),
                setting.PermissionState, isPending: false, isSessionOnly: _isPrivateWindow, blockedByGlobalRule: false);
        }

        if (ReferenceEquals(_active, tab)) UpdateSiteInformationButton(tab);
    }

    private async void HandlePermissionRequest(BrowserTab tab, CoreWebView2PermissionRequestedEventArgs e)
    {
        var deferral = e.GetDeferral();
        var promptGate = _permissionPromptGate;
        PermissionRequestCoordinator.Lease? sharedRequest = null;
        try
        {
            var core = tab.View.CoreWebView2;
            if (core is null)
            {
                e.State = CoreWebView2PermissionState.Deny;
                e.SavesInProfile = false;
                return;
            }
            var navigationGeneration = tab.NavigationGeneration;

            await promptGate.WaitAsync();
            try
            {
                // WebView2 can raise another request while a deferral is pending. Read
                // the profile only after this request reaches the serialized decision
                // point, otherwise two dialogs can race or stack on top of one another.
                if (!IsPermissionRequestStillCurrent(tab, core, navigationGeneration))
                {
                    e.State = CoreWebView2PermissionState.Default;
                    e.SavesInProfile = false;
                    return;
                }

                if (!PermissionLabels.TryGetOrigin(e.Uri, out var origin))
                {
                    // WebView2 profile settings accept only real web origins. Do not
                    // try to persist a decision for an internal/data URL.
                    e.State = CoreWebView2PermissionState.Default;
                    e.SavesInProfile = false;
                    return;
                }
                // The requesting origin can be an embedded chat/call component rather
                // than the top-level page. Keep that exact origin with the tab so the
                // lock panel never edits a different site's permission by accident.
                var activity = UpdatePermissionActivity(tab, e.PermissionKind, origin,
                    CoreWebView2PermissionState.Default, isPending: false, isSessionOnly: false, blockedByGlobalRule: false);
                var existing = await PermissionMutationCoordinator.RunAsync(core.Profile, origin, async () =>
                    (await core.Profile.GetNonDefaultPermissionSettingsAsync())
                        .FirstOrDefault(setting => setting.PermissionKind == e.PermissionKind
                            && PermissionLabels.SameOrigin(setting.PermissionOrigin, origin))
                        ?.PermissionState);

                // A direct decision from the site panel is authoritative. In particular,
                // the global notification guard must not silently override an explicit Allow.
                if (existing is CoreWebView2PermissionState.Allow or CoreWebView2PermissionState.Deny)
                {
                    e.State = existing.Value;
                    e.SavesInProfile = false;
                    UpdatePermissionActivity(tab, e.PermissionKind, origin, existing.Value,
                        isPending: false, isSessionOnly: _isPrivateWindow, blockedByGlobalRule: false, activity);
                    RefreshPermissionPresentation(tab);
                    return;
                }

                var sensitive = e.PermissionKind is CoreWebView2PermissionKind.Camera
                    or CoreWebView2PermissionKind.Microphone
                    or CoreWebView2PermissionKind.Geolocation
                    or CoreWebView2PermissionKind.Notifications
                    or CoreWebView2PermissionKind.ClipboardRead;
                if (!sensitive)
                {
                    e.State = CoreWebView2PermissionState.Default;
                    e.SavesInProfile = false;
                    RefreshPermissionPresentation(tab);
                    return;
                }

                if (e.PermissionKind == CoreWebView2PermissionKind.Notifications && _settings.Data.BlockNewNotificationRequests)
                {
                    e.State = CoreWebView2PermissionState.Deny;
                    e.SavesInProfile = false;
                    UpdatePermissionActivity(tab, e.PermissionKind, origin, CoreWebView2PermissionState.Deny,
                        isPending: false, isSessionOnly: false, blockedByGlobalRule: true, activity);
                    RefreshPermissionPresentation(tab);
                    return;
                }

                // Never let a hidden/background tab become the shared prompt
                // leader for another visible window. It can ask again after the
                // user returns to that tab and repeats the protected action.
                if (!ReferenceEquals(_active, tab))
                {
                    e.State = CoreWebView2PermissionState.Default;
                    e.SavesInProfile = false;
                    RefreshPermissionPresentation(tab);
                    return;
                }

                if (!IsPermissionRequestStillCurrent(tab, core, navigationGeneration))
                {
                    e.State = CoreWebView2PermissionState.Default;
                    e.SavesInProfile = false;
                    return;
                }

                sharedRequest = PermissionRequestCoordinator.Join(core.Profile, origin, e.PermissionKind);
                UpdatePermissionActivity(tab, e.PermissionKind, origin, CoreWebView2PermissionState.Default,
                    isPending: true, isSessionOnly: false, blockedByGlobalRule: false, activity);
                RefreshPermissionPresentation(tab);
                CoreWebView2PermissionState requestedState;
                if (sharedRequest.IsLeader)
                {
                    requestedState = await RequestSitePermissionDecisionAsync(tab, core, navigationGeneration, activity);
                    if (!IsPermissionRequestStillCurrent(tab, core, navigationGeneration))
                    {
                        sharedRequest.Complete(CoreWebView2PermissionState.Default);
                        e.State = CoreWebView2PermissionState.Default;
                        e.SavesInProfile = false;
                        return;
                    }
                    sharedRequest.Complete(requestedState);
                }
                else
                {
                    var localCancellation = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                    tab.SharedPermissionWaitCancellations.Add(localCancellation);
                    try
                    {
                        var completed = await Task.WhenAny(sharedRequest.Decision, localCancellation.Task);
                        if (!ReferenceEquals(completed, sharedRequest.Decision))
                        {
                            e.State = CoreWebView2PermissionState.Default;
                            e.SavesInProfile = false;
                            UpdatePermissionActivity(tab, e.PermissionKind, origin, CoreWebView2PermissionState.Default,
                                isPending: false, isSessionOnly: false, blockedByGlobalRule: false, activity);
                            RefreshPermissionPresentation(tab);
                            return;
                        }
                        requestedState = await sharedRequest.Decision;
                    }
                    finally
                    {
                        tab.SharedPermissionWaitCancellations.Remove(localCancellation);
                    }
                }

                if (!IsPermissionRequestStillCurrent(tab, core, navigationGeneration))
                {
                    e.State = CoreWebView2PermissionState.Default;
                    e.SavesInProfile = false;
                    return;
                }

                e.State = requestedState;
                // WebView2 owns the persistent decision for a live request. Updating
                // the profile from inside its own permission callback can race the
                // request, which made previous selections appear to do nothing.
                // An anonymous window uses its own disposable WebView2 profile, so
                // persisting Allow/Deny there keeps the choice for that anonymous
                // session without ever writing it into the normal profile.
                // Every still-current participant may persist the same shared
                // answer. This is idempotent and avoids losing the choice if the
                // leader's tab closes immediately after the user clicks a button.
                e.SavesInProfile = requestedState is CoreWebView2PermissionState.Allow or CoreWebView2PermissionState.Deny;
                UpdatePermissionActivity(tab, e.PermissionKind, origin, requestedState,
                    isPending: false,
                    isSessionOnly: _isPrivateWindow && (requestedState is CoreWebView2PermissionState.Allow or CoreWebView2PermissionState.Deny),
                    blockedByGlobalRule: false,
                    activity);
                RefreshPermissionPresentation(tab);
            }
            finally
            {
                promptGate.Release();
            }
        }
        catch (Exception error)
        {
            sharedRequest?.Complete(CoreWebView2PermissionState.Deny);
            Debug.WriteLine("Nepodařilo se zpracovat žádost o oprávnění: " + error);
            if (ReferenceEquals(tab.Owner, this) && PermissionLabels.TryGetOrigin(e.Uri, out var failedOrigin))
            {
                UpdatePermissionActivity(tab, e.PermissionKind, failedOrigin, CoreWebView2PermissionState.Default,
                    isPending: false, isSessionOnly: false, blockedByGlobalRule: false,
                    error: "Výzvu se nepodařilo zobrazit. Zkuste akci na webu znovu.");
                if (ReferenceEquals(_active, tab))
                    StatusText.Text = "Oprávnění se nepodařilo zobrazit. Zkuste akci na stránce znovu.";
                RefreshPermissionPresentation(tab);
            }
            e.State = CoreWebView2PermissionState.Deny;
            e.SavesInProfile = false;
        }
        finally
        {
            try { deferral.Complete(); }
            catch (Exception error) { Debug.WriteLine("Dokončení žádosti o oprávnění selhalo: " + error.Message); }
            finally { sharedRequest?.Dispose(); }
        }
    }

    private SitePermissionActivity UpdatePermissionActivity(BrowserTab tab, CoreWebView2PermissionKind kind, string origin,
        CoreWebView2PermissionState state, bool isPending, bool isSessionOnly, bool blockedByGlobalRule,
        SitePermissionActivity? existing = null, string? error = null)
    {
        origin = PermissionLabels.NormalizeOrigin(origin);
        var activity = existing ?? tab.PermissionActivities.FirstOrDefault(entry => entry.Kind == kind
            && PermissionLabels.SameOrigin(entry.Origin, origin));
        if (activity is null)
        {
            activity = new SitePermissionActivity(kind, origin);
            tab.PermissionActivities.Add(activity);
        }
        activity.State = state;
        activity.IsPending = isPending;
        if (isPending) activity.MediaErrorName = null;
        activity.IsSessionOnly = isSessionOnly;
        activity.BlockedByGlobalRule = blockedByGlobalRule;
        activity.LastError = error;
        activity.UpdatedAt = DateTimeOffset.Now;
        return activity;
    }

    private void RefreshPermissionPresentation(BrowserTab tab)
    {
        if (!Dispatcher.CheckAccess())
        {
            _ = Dispatcher.BeginInvoke(() => RefreshPermissionPresentation(tab));
            return;
        }
        if (!ReferenceEquals(_active, tab)) return;
        UpdateSiteInformationButton(tab);
        RefreshOpenSiteInformation(tab);
    }

    private Task<CoreWebView2PermissionState> RequestSitePermissionDecisionAsync(BrowserTab tab, CoreWebView2 core,
        long navigationGeneration, SitePermissionActivity activity)
    {
        if (!Dispatcher.CheckAccess())
            return Dispatcher.InvokeAsync(() => RequestSitePermissionDecisionAsync(tab, core, navigationGeneration, activity)).Task.Unwrap();

        if (!IsPermissionRequestStillCurrent(tab, core, navigationGeneration))
            return Task.FromResult(CoreWebView2PermissionState.Default);

        // A background tab must never attach its prompt to the visible page's
        // lock. It can request again when the user returns to it and performs the
        // relevant action, just like a cancelled browser permission prompt.
        if (!ReferenceEquals(_active, tab))
            return Task.FromResult(CoreWebView2PermissionState.Default);

        CompletePendingSitePermissionRequest(CoreWebView2PermissionState.Default);
        var request = new PendingSitePermissionRequest(tab, core, navigationGeneration, activity);
        _pendingSitePermissionRequest = request;
        SiteInfoPopup.IsOpen = false;
        _siteInfoRenderVersion++;
        PermissionPromptOriginText.Text = activity.Origin;
        PermissionPromptRequestText.Text = $"chce používat {PermissionLabels.For(activity.Kind)}.";
        PermissionPromptHintText.Text = _isPrivateWindow
            ? "Volba platí pro tuto anonymní relaci a po jejím zavření se smaže."
            : "Vaše volba se uloží pro tento přesný původ webu. Web může požádat znovu po změně nastavení.";
        SitePermissionPromptPopup.IsOpen = true;
        UpdateSiteInformationButton(tab);
        return request.Decision.Task;
    }

    private void CompletePendingSitePermissionRequest(CoreWebView2PermissionState state)
    {
        var request = _pendingSitePermissionRequest;
        if (request is null) return;
        _pendingSitePermissionRequest = null;
        SitePermissionPromptPopup.IsOpen = false;
        request.Activity.State = state;
        request.Activity.IsPending = false;
        request.Activity.IsSessionOnly = _isPrivateWindow
            && (state is CoreWebView2PermissionState.Allow or CoreWebView2PermissionState.Deny);
        request.Activity.UpdatedAt = DateTimeOffset.Now;
        RefreshPermissionPresentation(request.Tab);
        request.Decision.TrySetResult(state);
    }

    private void CancelPendingSitePermissionRequest(BrowserTab tab)
    {
        foreach (var cancellation in tab.SharedPermissionWaitCancellations.ToArray())
            cancellation.TrySetResult(true);
        tab.SharedPermissionWaitCancellations.Clear();
        if (ReferenceEquals(_pendingSitePermissionRequest?.Tab, tab))
            CompletePendingSitePermissionRequest(CoreWebView2PermissionState.Default);
    }

    private void PermissionPromptAllow_Click(object sender, RoutedEventArgs e)
        => CompletePendingSitePermissionRequest(CoreWebView2PermissionState.Allow);

    private void PermissionPromptDeny_Click(object sender, RoutedEventArgs e)
        => CompletePendingSitePermissionRequest(CoreWebView2PermissionState.Deny);

    private void PermissionPromptDismiss_Click(object sender, RoutedEventArgs e)
        => CompletePendingSitePermissionRequest(CoreWebView2PermissionState.Default);

    private async void SitePermissionsButton_Click(object sender, RoutedEventArgs e)
    {
        var tab = _active;
        var core = tab?.View.CoreWebView2;
        if (tab is null || core is null)
        {
            StatusText.Text = "Oprávnění budou dostupná po načtení stránky.";
            return;
        }
        if (ReferenceEquals(_pendingSitePermissionRequest?.Tab, tab))
        {
            // Keep the live request visible and avoid stacking the information
            // panel directly over the Allow/Block prompt.
            SiteInfoPopup.IsOpen = false;
            SitePermissionPromptPopup.IsOpen = true;
            return;
        }
        SiteInfoPopup.IsOpen = !SiteInfoPopup.IsOpen;
        if (!SiteInfoPopup.IsOpen)
        {
            _siteInfoRenderVersion++;
            return;
        }
        await RenderSiteInformationAsync(tab);
    }

    private void RefreshOpenSiteInformation(BrowserTab tab)
    {
        if (SiteInfoPopup.IsOpen && ReferenceEquals(_active, tab))
            _ = RenderSiteInformationAsync(tab);
    }

    private async Task RenderSiteInformationAsync(BrowserTab tab)
    {
        var core = tab.View.CoreWebView2;
        if (core is null || !SiteInfoPopup.IsOpen || !ReferenceEquals(_active, tab)) return;

        await SyncPermissionActivitiesFromProfileAsync(tab);
        if (core is null || !SiteInfoPopup.IsOpen || !ReferenceEquals(_active, tab)) return;

        var origin = PermissionLabels.ToOrigin(core.Source);
        var host = GetPageHost(tab);
        var protectionEnabled = _settings.Data.BlockMode != BlockMode.Off && !string.IsNullOrWhiteSpace(host) && !IsWhitelisted(host);
        var renderVersion = ++_siteInfoRenderVersion;
        var permissionActivities = tab.PermissionActivities.ToArray();
        var permissionOrigins = permissionActivities.Select(activity => activity.Origin)
            .Append(origin)
            .Select(PermissionLabels.NormalizeOrigin)
            .Where(candidate => PermissionLabels.TryGetOrigin(candidate, out _))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var panel = new SiteInformationPanel(SiteInfoContent, core, origin, _isPrivateWindow, protectionEnabled, tab.BlockedCount,
            enabled => SetSiteProtectionAsync(tab, host, enabled),
            () =>
            {
                _siteInfoRenderVersion++;
                SiteInfoPopup.IsOpen = false;
                new PermissionsWindow(core.Profile, origin, _isPrivateWindow, permissionOrigins,
                    (setting, state) =>
                    {
                        if (!ReferenceEquals(tab.Owner, this) || !_tabs.Contains(tab)) return;
                        var updatedActivity = UpdatePermissionActivity(tab, setting.PermissionKind, setting.PermissionOrigin, state,
                            isPending: false,
                            isSessionOnly: _isPrivateWindow && (state is CoreWebView2PermissionState.Allow or CoreWebView2PermissionState.Deny),
                            blockedByGlobalRule: false);
                        updatedActivity.MediaErrorName = null;
                        RefreshPermissionPresentation(tab);
                    }) { Owner = this }.ShowDialog();
            },
            permissionActivities,
            () =>
            {
                if (ReferenceEquals(_active, tab))
                    UpdateSiteInformationButton(tab);
            },
            () => renderVersion == _siteInfoRenderVersion
                && ReferenceEquals(_active, tab)
                && SiteInfoPopup.IsOpen
                && ReferenceEquals(tab.View.CoreWebView2, core)
                && string.Equals(PermissionLabels.ToOrigin(core.Source), origin, StringComparison.OrdinalIgnoreCase));
        await panel.RenderAsync();
    }

    private async Task SetSiteProtectionAsync(BrowserTab tab, string host, bool enabled)
    {
        if (string.IsNullOrWhiteSpace(host)) return;
        _settings.Data.Whitelist.RemoveAll(item => string.Equals(item, host, StringComparison.OrdinalIgnoreCase));
        if (!enabled) _settings.Data.Whitelist.Add(host);
        _settings.Save();
        await ApplyYamaBlockToAllTabsAsync();
        if (_active == tab) BlockedText.Text = enabled ? $"YamaBlock · {tab.BlockedCount} blokováno" : "YamaBlock · výjimka pro tento web";
        _siteInfoRenderVersion++;
        SiteInfoPopup.IsOpen = false;
        StatusText.Text = enabled ? "YamaBlock je pro tento web zapnutý." : "YamaBlock je pro tento web vypnutý.";
    }

    private bool IsPermissionRequestStillCurrent(BrowserTab tab, CoreWebView2 core, long navigationGeneration)
        => !_isClosing
            && ReferenceEquals(tab.Owner, this)
            && _tabs.Contains(tab)
            && ReferenceEquals(tab.View.CoreWebView2, core)
            && tab.NavigationGeneration == navigationGeneration;

    private void TitleBar_MouseDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton != MouseButton.Left || IsInteractiveHeaderElement(e.OriginalSource as DependencyObject))
            return;

        if (e.ClickCount == 2)
        {
            ToggleWindowMaximize();
            e.Handled = true;
            return;
        }

        if (_customMaximized)
            RestoreCustomMaximize();

        DragMove();
    }

    private static bool IsInteractiveHeaderElement(DependencyObject? source)
    {
        while (source != null)
        {
            if (source is Button or TextBox) return true;
            source = VisualTreeHelper.GetParent(source);
        }
        return false;
    }

    private void ToggleWindowMaximize()
    {
        if (_videoFullScreen) return;
        if (_customMaximized) RestoreCustomMaximize();
        else MaximizeToWorkingArea();
    }

    private void MaximizeToWorkingArea()
    {
        if (!_customMaximized)
        {
            _restoreWindowBounds = new Rect(Left, Top, ActualWidth > 0 ? ActualWidth : Width, ActualHeight > 0 ? ActualHeight : Height);
        }

        WindowState = WindowState.Normal;
        _customMaximized = true;
        Topmost = false;
        ResizeMode = ResizeMode.NoResize;
        AppWindowChrome.ResizeBorderThickness = new Thickness(0);
        ApplyMonitorBounds(useWorkingArea: true);
    }

    private void RestoreCustomMaximize()
    {
        _customMaximized = false;
        WindowState = WindowState.Normal;
        Topmost = false;
        ResizeMode = ResizeMode.CanResize;
        AppWindowChrome.ResizeBorderThickness = new Thickness(6);

        if (_restoreWindowBounds.Width > 0 && _restoreWindowBounds.Height > 0)
        {
            Left = _restoreWindowBounds.Left;
            Top = _restoreWindowBounds.Top;
            Width = _restoreWindowBounds.Width;
            Height = _restoreWindowBounds.Height;
        }
    }

    private void SetVideoFullScreen(bool enabled)
    {
        if (_videoFullScreen == enabled) return;

        var rows = ((Grid)Content).RowDefinitions;
        if (enabled)
        {
            _videoFullScreen = true;
            _wasMaximizedBeforeVideo = _customMaximized;
            _sidePanelWasVisibleBeforeVideo = SidePanel.Visibility == Visibility.Visible;

            if (!_customMaximized)
                _videoRestoreBounds = new Rect(Left, Top, ActualWidth > 0 ? ActualWidth : Width, ActualHeight > 0 ? ActualHeight : Height);

            FavoritesQuickPopup.IsOpen = false;
            HistoryQuickPopup.IsOpen = false;
            DownloadPopup.IsOpen = false;
            FavoritesOverflowPopup.IsOpen = false;
            SidePanel.Visibility = Visibility.Collapsed;
            PanelColumn.Width = new GridLength(0);

            rows[0].Height = new GridLength(0);
            rows[1].Height = new GridLength(0);
            rows[2].Height = new GridLength(0);
            rows[4].Height = new GridLength(0);

            WindowState = WindowState.Normal;
            ResizeMode = ResizeMode.NoResize;
            AppWindowChrome.ResizeBorderThickness = new Thickness(0);
            Topmost = true;
            ApplyMonitorBounds(useWorkingArea: false, forceTopmost: true);

            // WebView2/YouTube and the Windows shell can both touch the z-order while
            // entering fullscreen. Re-assert the real monitor bounds a few times after
            // the transition so the video remains above the Windows taskbar as well.
            _ = ReassertVideoFullscreenAsync();
        }
        else
        {
            _videoFullScreen = false;
            Topmost = false;
            SetWindowTopmostState(false);
            ResizeMode = ResizeMode.CanResize;
            AppWindowChrome.ResizeBorderThickness = new Thickness(6);
            rows[0].Height = new GridLength(60);
            rows[1].Height = new GridLength(64);
            rows[2].Height = GridLength.Auto;
            rows[4].Height = new GridLength(30);
            FavoritesBar.Visibility = _settings.Data.FavoritesBarVisible ? Visibility.Visible : Visibility.Collapsed;

            if (_sidePanelWasVisibleBeforeVideo)
            {
                SidePanel.Visibility = Visibility.Visible;
                PanelColumn.Width = new GridLength(300);
            }

            if (_wasMaximizedBeforeVideo)
            {
                _customMaximized = false;
                MaximizeToWorkingArea();
            }
            else if (_videoRestoreBounds.Width > 0 && _videoRestoreBounds.Height > 0)
            {
                WindowState = WindowState.Normal;
                Left = _videoRestoreBounds.Left;
                Top = _videoRestoreBounds.Top;
                Width = _videoRestoreBounds.Width;
                Height = _videoRestoreBounds.Height;
            }
        }
    }

    private async Task ReassertVideoFullscreenAsync()
    {
        foreach (var delay in new[] { 40, 180, 550 })
        {
            await Task.Delay(delay);
            if (!_videoFullScreen) return;

            await Dispatcher.InvokeAsync(() =>
            {
                if (!_videoFullScreen) return;
                Topmost = true;
                ApplyMonitorBounds(useWorkingArea: false, forceTopmost: true);
                Activate();
            }, System.Windows.Threading.DispatcherPriority.Send);
        }
    }

    private void ApplyMonitorBounds(bool useWorkingArea, bool forceTopmost = false)
    {
        var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
        if (handle == IntPtr.Zero) return;

        const uint MonitorDefaultToNearest = 0x00000002;
        var monitor = MonitorFromWindow(handle, MonitorDefaultToNearest);
        if (monitor == IntPtr.Zero) return;

        var info = new MonitorInfo { CbSize = Marshal.SizeOf<MonitorInfo>() };
        if (!GetMonitorInfo(monitor, ref info)) return;

        var rect = useWorkingArea ? info.WorkArea : info.MonitorArea;
        const uint SwpNoZOrder = 0x0004;
        const uint SwpNoActivate = 0x0010;
        const uint SwpFrameChanged = 0x0020;
        const uint SwpShowWindow = 0x0040;
        var insertAfter = forceTopmost ? new IntPtr(-1) : IntPtr.Zero; // HWND_TOPMOST
        var flags = SwpFrameChanged | SwpShowWindow;

        if (!forceTopmost)
            flags |= SwpNoActivate | SwpNoZOrder;

        SetWindowPos(
            handle,
            insertAfter,
            rect.Left,
            rect.Top,
            rect.Right - rect.Left,
            rect.Bottom - rect.Top,
            flags);

        if (forceTopmost)
        {
            BringWindowToTop(handle);
            SetForegroundWindow(handle);
            SetActiveWindow(handle);
        }
    }

    private void SetWindowTopmostState(bool topmost)
    {
        var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
        if (handle == IntPtr.Zero) return;

        const uint SwpNoMove = 0x0002;
        const uint SwpNoSize = 0x0001;
        const uint SwpNoActivate = 0x0010;
        var insertAfter = topmost ? new IntPtr(-1) : new IntPtr(-2); // HWND_TOPMOST / HWND_NOTOPMOST
        SetWindowPos(handle, insertAfter, 0, 0, 0, 0, SwpNoMove | SwpNoSize | SwpNoActivate);
    }

    private void Minimize_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;
    private void Maximize_Click(object sender, RoutedEventArgs e) => ToggleWindowMaximize();
    private void Close_Click(object sender, RoutedEventArgs e) => Close();
    private void MainWindow_KeyDown(object sender, KeyEventArgs e)
    {
        if (Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift) && e.Key == Key.N)
        {
            NewPrivateWindow_Click(sender, e);
            e.Handled = true;
            return;
        }

        if (Keyboard.Modifiers != ModifierKeys.Control) return;

        if (e.Key == Key.T)
        {
            if (!_siteAppMode) _ = CreateTabAsync();
            e.Handled = true;
        }
        else if (e.Key == Key.N)
        {
            NewWindow_Click(sender, e);
            e.Handled = true;
        }
        else if (e.Key == Key.L && !_siteAppMode)
        {
            AddressBox.Focus();
            AddressBox.SelectAll();
            e.Handled = true;
        }
        else if (e.Key == Key.F)
        {
            FindOnPage_Click(sender, e);
            e.Handled = true;
        }
        else if (e.Key == Key.P)
        {
            PrintPage_Click(sender, e);
            e.Handled = true;
        }
    }
    private void ApplyTheme(string theme)
    {
        Resources["WindowBrush"] = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0B101A"));
        Resources["SurfaceBrush"] = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#121A27"));
        Resources["SurfaceRaisedBrush"] = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#192437"));
        Resources["TextBrush"] = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#EAF3FF"));
        Resources["MutedBrush"] = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#96A7BD"));
    }
    private void InitializeWindowInterop()
    {
        SetDarkWindowBorder();
        var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
        System.Windows.Interop.HwndSource.FromHwnd(handle)?.AddHook(WindowProc);
    }

    private IntPtr WindowProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        const int WmGetMinMaxInfo = 0x0024;
        if (msg == WmGetMinMaxInfo)
        {
            ApplyMonitorMaxBounds(hwnd, lParam, useWorkingArea: !_videoFullScreen);
            handled = true;
        }
        return IntPtr.Zero;
    }

    private static void ApplyMonitorMaxBounds(IntPtr hwnd, IntPtr lParam, bool useWorkingArea)
    {
        const uint MonitorDefaultToNearest = 0x00000002;
        var monitor = MonitorFromWindow(hwnd, MonitorDefaultToNearest);
        if (monitor == IntPtr.Zero) return;

        var info = new MonitorInfo { CbSize = Marshal.SizeOf<MonitorInfo>() };
        if (!GetMonitorInfo(monitor, ref info)) return;

        var mmi = Marshal.PtrToStructure<MinMaxInfo>(lParam);
        var monitorArea = info.MonitorArea;
        var target = useWorkingArea ? info.WorkArea : monitorArea;

        mmi.MaxPosition.X = target.Left - monitorArea.Left;
        mmi.MaxPosition.Y = target.Top - monitorArea.Top;
        mmi.MaxSize.X = target.Right - target.Left;
        mmi.MaxSize.Y = target.Bottom - target.Top;
        mmi.MaxTrackSize = mmi.MaxSize;

        Marshal.StructureToPtr(mmi, lParam, true);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MinMaxInfo
    {
        public NativePoint Reserved;
        public NativePoint MaxSize;
        public NativePoint MaxPosition;
        public NativePoint MinTrackSize;
        public NativePoint MaxTrackSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct MonitorInfo
    {
        public int CbSize;
        public NativeRect MonitorArea;
        public NativeRect WorkArea;
        public uint Flags;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr hWndInsertAfter,
        int x,
        int y,
        int cx,
        int cy,
        uint uFlags);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr SetActiveWindow(IntPtr hWnd);

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
        var brand = File.Exists(brandPath) ? Convert.ToBase64String(File.ReadAllBytes(brandPath)) : "";

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
            return $"<div class='favorite-card' draggable='true' data-url='{safeUrl}' title='{safeHost}'><button class='favorite-remove' type='button' title='Odebrat z oblíbených' onclick='removeFavorite(event,this)'>×</button><a class='favorite-main' draggable='false' href='{safeUrl}'><span class='favorite-icon'><span class='favorite-fallback'>✦</span><img src='{safeFavicon}' alt='' onload=\"this.previousElementSibling.style.display='none'\" onerror=\"this.style.display='none'\"></span><span class='favorite-name'>{safeLabel}</span><span class='favorite-host'>{safeHost}</span></a></div>";
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
            .favorite-card{{position:relative;min-height:126px;border-radius:15px;border:1px solid #294465;background:linear-gradient(180deg,#142137,#101a2b);color:#eaf3ff;transition:transform .15s ease,border-color .15s ease,background .15s ease,box-shadow .15s ease,opacity .12s ease;overflow:hidden;cursor:grab}}
            .favorite-card:hover{{transform:translateY(-2px);border-color:#3b80b8;background:linear-gradient(180deg,#192a44,#122139);box-shadow:0 12px 26px #00000030,0 0 0 1px #23c9f522}}
            .favorite-card.dragging{{opacity:.46;cursor:grabbing;transform:scale(.98)}}
            .favorite-card.drag-over{{border-color:#54d7f8;box-shadow:0 0 0 2px #23c9f566}}
            .favorite-main{{min-height:126px;padding:17px 14px 14px;text-decoration:none;color:#eaf3ff;display:flex;flex-direction:column;align-items:center;justify-content:center}}
            .favorite-remove{{position:absolute;z-index:2;right:7px;top:7px;width:25px;height:25px;padding:0;border-radius:8px;background:#3a2030;color:#ffbdc9;border:1px solid #654052;opacity:.72;font-size:16px;line-height:20px}}
            .favorite-card:hover .favorite-remove{{opacity:1}}
            .favorite-remove:hover{{background:#5a263c;border-color:#d85a7b}}
            .favorite-icon{{width:42px;height:42px;border-radius:11px;background:#0d1727;border:1px solid #2d4667;display:grid;place-items:center;margin-bottom:10px;overflow:hidden}}
            .favorite-icon{{position:relative}}
            .favorite-fallback{{position:absolute;inset:0;display:grid;place-items:center;color:#54d7f8;font-size:22px;text-shadow:0 0 10px #23c9f566}}
            .favorite-icon img{{position:relative;z-index:1;width:28px;height:28px;object-fit:contain}}
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
            const favoriteGrid=document.querySelector('.favorites-grid');let draggedCard=null;let suppressOpenUntil=0;
            if(favoriteGrid){{
              favoriteGrid.addEventListener('dragstart',event=>{{const card=event.target.closest('.favorite-card');if(!card)return;draggedCard=card;card.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',card.dataset.url);}});
              favoriteGrid.addEventListener('dragover',event=>{{if(!draggedCard)return;event.preventDefault();const card=event.target.closest('.favorite-card');if(!card||card===draggedCard)return;document.querySelectorAll('.favorite-card.drag-over').forEach(x=>x.classList.remove('drag-over'));card.classList.add('drag-over');const rect=card.getBoundingClientRect();const after=event.clientY>rect.top+rect.height/2||(Math.abs(event.clientY-(rect.top+rect.height/2))<rect.height*.2&&event.clientX>rect.left+rect.width/2);favoriteGrid.insertBefore(draggedCard,after?card.nextSibling:card);}});
              favoriteGrid.addEventListener('drop',event=>{{if(!draggedCard)return;event.preventDefault();draggedCard.classList.remove('dragging');document.querySelectorAll('.favorite-card.drag-over').forEach(x=>x.classList.remove('drag-over'));const urls=[...favoriteGrid.querySelectorAll('.favorite-card')].map(x=>x.dataset.url);window.chrome.webview.postMessage(JSON.stringify({{action:'reorderFavorites',urls}}));draggedCard=null;suppressOpenUntil=Date.now()+450;}});
              favoriteGrid.addEventListener('dragend',()=>{{if(draggedCard)draggedCard.classList.remove('dragging');document.querySelectorAll('.favorite-card.drag-over').forEach(x=>x.classList.remove('drag-over'));draggedCard=null;}});
              favoriteGrid.addEventListener('click',event=>{{if(Date.now()<suppressOpenUntil){{event.preventDefault();event.stopPropagation();}}}},true);
            }}
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

internal sealed class PrivateWebSession
{
    internal sealed class ControllerInitialization
    {
        public ControllerInitialization(CoreWebView2Environment environment) => Environment = environment;
        public CoreWebView2Environment Environment { get; }
    }

    private readonly object _sync = new();
    private Task<CoreWebView2Environment>? _environmentTask;
    private int _liveTabLeases;
    private readonly HashSet<ControllerInitialization> _pendingControllerInitializations = [];
    private bool _awaitingBrowserProcessExit;
    private bool _cleanupRequested;
    private bool _profileDeletionRunning;
    private bool _profileDeleted;

    public string DataFolder { get; } = Path.Combine(Path.GetTempPath(), "YamaSearch", "Private", Guid.NewGuid().ToString("N"));

    public bool CanCreateTabs
    {
        get
        {
            lock (_sync)
                return !_cleanupRequested && !_profileDeletionRunning && !_profileDeleted;
        }
    }

    public void RetainTab()
    {
        lock (_sync)
        {
            if (_cleanupRequested || _profileDeletionRunning || _profileDeleted)
                throw new InvalidOperationException("Anonymní relace už byla ukončena.");
            _liveTabLeases++;
        }
    }

    public void ReleaseTab()
    {
        var deleteNow = false;
        lock (_sync)
        {
            if (_liveTabLeases == 0) return;
            _liveTabLeases--;
            if (_liveTabLeases == 0)
            {
                _cleanupRequested = true;
                deleteNow = IsProfileDeletionEligibleLocked();
            }
        }
        if (deleteNow) DeleteProfileIfEligible();
    }

    public ControllerInitialization BeginControllerInitialization(CoreWebView2Environment environment)
    {
        lock (_sync)
        {
            if (_cleanupRequested || _profileDeletionRunning || _profileDeleted || !IsCurrentEnvironmentLocked(environment))
                throw new InvalidOperationException("Anonymní relace už byla ukončena.");
            var initialization = new ControllerInitialization(environment);
            _pendingControllerInitializations.Add(initialization);
            return initialization;
        }
    }

    public void CompleteControllerInitialization(ControllerInitialization initialization, bool browserProcessMayBeRunning)
        => FinishControllerInitialization(initialization, browserProcessMayBeRunning);

    public void CancelControllerInitialization(ControllerInitialization initialization, bool browserProcessMayBeRunning)
        => FinishControllerInitialization(initialization, browserProcessMayBeRunning);

    private void FinishControllerInitialization(ControllerInitialization initialization, bool browserProcessMayBeRunning)
    {
        var deleteNow = false;
        lock (_sync)
        {
            if (!_pendingControllerInitializations.Remove(initialization)) return;
            // Even a failed controller initialization can have started Chromium.
            // Only a direct process snapshot (or BrowserProcessExited) decides
            // whether the profile may be deleted; task failure is not enough.
            if (browserProcessMayBeRunning && IsCurrentEnvironmentLocked(initialization.Environment))
                _awaitingBrowserProcessExit = true;
            deleteNow = IsProfileDeletionEligibleLocked();
        }
        if (deleteNow) DeleteProfileIfEligible();
    }

    public Task<CoreWebView2Environment> GetOrCreateEnvironmentTask(Func<Task<CoreWebView2Environment>> createEnvironment)
    {
        lock (_sync)
        {
            if (_cleanupRequested || _profileDeletionRunning || _profileDeleted)
                throw new InvalidOperationException("Anonymní relace už byla ukončena.");
            if (_environmentTask is not null) return _environmentTask;

            var environmentTask = createEnvironment();
            _environmentTask = environmentTask;
            _ = environmentTask.ContinueWith(
                completed =>
                {
                    if (completed.IsCompletedSuccessfully)
                    {
                        // An empty private window can close before its first
                        // controller is requested. Re-checking here starts cleanup
                        // only in that controller-free case; a real controller is
                        // tracked separately and waits for BrowserProcessExited.
                        DeleteProfileIfEligible();
                    }
                    else
                    {
                        InvalidateEnvironmentTask(completed);
                    }
                },
                CancellationToken.None,
                TaskContinuationOptions.ExecuteSynchronously,
                TaskScheduler.Default);
            return environmentTask;
        }
    }

    public void InvalidateEnvironmentTask(Task<CoreWebView2Environment> environmentTask)
    {
        var deleteNow = false;
        lock (_sync)
        {
            if (!ReferenceEquals(_environmentTask, environmentTask)) return;
            _environmentTask = null;
            _awaitingBrowserProcessExit = false;
            deleteNow = IsProfileDeletionEligibleLocked();
        }
        if (deleteNow) DeleteProfileIfEligible();
    }

    public void BrowserProcessExited(CoreWebView2Environment environment)
    {
        var deleteNow = false;
        lock (_sync)
        {
            // A process exit is terminal for every in-flight controller creation
            // tied to this environment. Their continuations can arrive later, so
            // remove the exact tokens now and let those later calls become no-ops.
            _pendingControllerInitializations.RemoveWhere(initialization => ReferenceEquals(initialization.Environment, environment));
            if (IsCurrentEnvironmentLocked(environment))
            {
                _environmentTask = null;
                _awaitingBrowserProcessExit = false;
            }
            deleteNow = IsProfileDeletionEligibleLocked();
        }
        if (deleteNow) DeleteProfileIfEligible();
    }

    private void DeleteProfileIfEligible()
    {
        lock (_sync)
        {
            if (_profileDeleted || _profileDeletionRunning || !IsProfileDeletionEligibleLocked()) return;
            _profileDeletionRunning = true;
        }

        _ = DeleteProfileAfterBrowserExitAsync();
    }

    private bool IsProfileDeletionEligibleLocked()
        => _cleanupRequested
            && _liveTabLeases == 0
            && _pendingControllerInitializations.Count == 0
            && !_awaitingBrowserProcessExit
            && (_environmentTask is null || _environmentTask.IsCompleted);

    private bool IsCurrentEnvironmentLocked(CoreWebView2Environment environment)
        => _environmentTask is { IsCompletedSuccessfully: true }
            && ReferenceEquals(_environmentTask.Result, environment);

    private async Task DeleteProfileAfterBrowserExitAsync()
    {
        var deleted = false;
        try
        {
            // BrowserProcessExited is the lifecycle boundary. A few short,
            // non-UI filesystem retries only account for Windows releasing the
            // final profile handle; they never keep or force-close a window.
            for (var attempt = 0; attempt < 4; attempt++)
            {
                try
                {
                    if (Directory.Exists(DataFolder)) Directory.Delete(DataFolder, true);
                    deleted = true;
                    break;
                }
                catch (IOException) when (attempt < 3)
                {
                    await Task.Delay(125).ConfigureAwait(false);
                }
                catch (UnauthorizedAccessException) when (attempt < 3)
                {
                    await Task.Delay(125).ConfigureAwait(false);
                }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
        }
        finally
        {
            lock (_sync)
            {
                _profileDeletionRunning = false;
                _profileDeleted = deleted;
            }
        }
    }
}

internal sealed class SitePermissionActivity
{
    public SitePermissionActivity(CoreWebView2PermissionKind kind, string origin)
    {
        Kind = kind;
        Origin = origin;
    }

    public CoreWebView2PermissionKind Kind { get; }
    public string Origin { get; }
    public CoreWebView2PermissionState State { get; set; } = CoreWebView2PermissionState.Default;
    public bool IsPending { get; set; }
    public bool IsSessionOnly { get; set; }
    public bool BlockedByGlobalRule { get; set; }
    public string? LastError { get; set; }
    public string? MediaErrorName { get; set; }
    public HashSet<string> PendingMediaRequestIds { get; } = new(StringComparer.Ordinal);
    public HashSet<string> ActiveMediaTrackIds { get; } = new(StringComparer.Ordinal);
    public bool IsMediaRequestPending => PendingMediaRequestIds.Count > 0;
    public bool IsMediaInUse => ActiveMediaTrackIds.Count > 0;
    public bool WasMediaUsed { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.Now;
}

internal sealed class PendingSitePermissionRequest
{
    public PendingSitePermissionRequest(BrowserTab tab, CoreWebView2 core, long navigationGeneration, SitePermissionActivity activity)
    {
        Tab = tab;
        Core = core;
        NavigationGeneration = navigationGeneration;
        Activity = activity;
    }

    public BrowserTab Tab { get; }
    public CoreWebView2 Core { get; }
    public long NavigationGeneration { get; }
    public SitePermissionActivity Activity { get; }
    public TaskCompletionSource<CoreWebView2PermissionState> Decision { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
}

public sealed class BrowserTab
{
    public Guid Id { get; } = Guid.NewGuid();
    internal string MediaUsageBridgeToken { get; } = Guid.NewGuid().ToString("N");
    public WebView2 View { get; } = new() { DefaultBackgroundColor = System.Drawing.Color.FromArgb(0x0B, 0x10, 0x1A) };
    public MainWindow? Owner { get; set; }
    internal PrivateWebSession? PrivateSession { get; set; }
    internal PrivateWebSession.ControllerInitialization? PrivateInitialization { get; set; }
    internal List<SitePermissionActivity> PermissionActivities { get; } = [];
    internal HashSet<TaskCompletionSource<bool>> SharedPermissionWaitCancellations { get; } = [];
    public string Title { get; set; } = "Nová karta";
    public ImageSource? Favicon { get; set; }
    public bool IsYamaNewTab { get; set; }
    public long NavigationGeneration { get; set; }
    internal int PermissionSyncVersion { get; set; }
    public int BlockedCount { get; set; }
    public string? YamaBlockScriptId { get; set; }
    public bool IsPlayingAudio { get; set; }
    public bool IsMuted { get; set; }
    public bool HasWebNotification { get; set; }
    public int? NotificationCount { get; set; }
}
public sealed record TabDragPayload(MainWindow Source, BrowserTab Tab)
{
    public Guid SourceWindowId => Source.WindowId;
    public Guid TabId => Tab.Id;
}

internal static class TabWindowRegistry
{
    private static readonly Dictionary<Guid, WeakReference<MainWindow>> Windows = [];

    public static void Register(Guid windowId, MainWindow window) => Windows[windowId] = new WeakReference<MainWindow>(window);

    public static void Unregister(Guid windowId) => Windows.Remove(windowId);

    public static bool IsRegistered(Guid windowId, MainWindow window)
        => Windows.TryGetValue(windowId, out var entry)
            && entry.TryGetTarget(out var registered)
            && ReferenceEquals(registered, window);
}

internal static class TabTransferCoordinator
{
    private static readonly HashSet<Guid> TransferringTabIds = [];

    public static bool TryBegin(MainWindow source, BrowserTab tab)
        => tab.Owner == source
            && TabWindowRegistry.IsRegistered(source.WindowId, source)
            && TransferringTabIds.Add(tab.Id);

    public static bool IsInProgress(BrowserTab tab) => TransferringTabIds.Contains(tab.Id);

    public static void End(BrowserTab tab) => TransferringTabIds.Remove(tab.Id);
}
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
public sealed class SiteAppEntry
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "Webová aplikace";
    public string Url { get; set; } = "";
    public string Host { get; set; } = "";
    public string FaviconUrl { get; set; } = "";
    public string IconPath { get; set; } = "";
    public DateTimeOffset InstalledAt { get; set; } = DateTimeOffset.Now;
    public bool AddToStartMenu { get; set; } = true;
    public bool CreateDesktopShortcut { get; set; }
    public bool StartOnLogin { get; set; }
}

public sealed class AppData { public string Theme { get; set; } = "dark"; public string HomePage { get; set; } = "yamasearch://newtab"; public string SearchEngine { get; set; } = "DuckDuckGo"; public string CustomSearchEndpoint { get; set; } = ""; public bool OnboardingCompleted { get; set; } = false; public bool FavoritesBarVisible { get; set; } = false; public bool HardwareAccelerationEnabled { get; set; } = true; public BlockMode BlockMode { get; set; } = BlockMode.Standard; public bool EnableYouTubeAdBlock { get; set; } = true; public bool EnableCosmeticBlocking { get; set; } = true; public bool EnableTrackerBlocking { get; set; } = true; public SecurityLevel SecurityLevel { get; set; } = SecurityLevel.Recommended; public bool EnableSmartScreen { get; set; } = true; public bool OfferPasswordSave { get; set; } = true; public bool EnableGeneralAutofill { get; set; } = true; public bool BlockNewNotificationRequests { get; set; } = false; public bool EnableNativeNotifications { get; set; } = true; public bool EnableNotificationSound { get; set; } = true; public bool EnableTabNotificationIndicators { get; set; } = true; public string PreferredAccountProvider { get; set; } = ""; public List<string> Whitelist { get; set; } = []; public List<string> Bookmarks { get; set; } = []; public List<HistoryEntry> History { get; set; } = []; public List<DownloadEntry> Downloads { get; set; } = []; public List<SiteAppEntry> InstalledApps { get; set; } = []; }
public sealed class HistoryEntry { public string Url { get; set; } = ""; public string Title { get; set; } = ""; public string FaviconUrl { get; set; } = ""; public DateTimeOffset VisitedAt { get; set; } }
public sealed class DownloadEntry
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Url { get; set; } = "";
    public string FileName { get; set; } = "";
    public string FilePath { get; set; } = "";
    public long BytesReceived { get; set; }
    public long TotalBytes { get; set; }
    public string State { get; set; } = "Probíhá";
    public DateTimeOffset StartedAt { get; set; } = DateTimeOffset.Now;
    public DateTimeOffset? CompletedAt { get; set; }
}
public sealed class SettingsStore
{
    private readonly string _path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YamaSearch", "settings.json");
    public AppData Data { get; }
    public SettingsStore() { try { Data = File.Exists(_path) ? JsonSerializer.Deserialize<AppData>(File.ReadAllText(_path)) ?? new() : new(); } catch { Data = new(); } }
    public void Save() { Directory.CreateDirectory(Path.GetDirectoryName(_path)!); File.WriteAllText(_path, JsonSerializer.Serialize(Data, new JsonSerializerOptions { WriteIndented = true })); }
}
