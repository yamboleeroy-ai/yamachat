using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media.Imaging;

namespace YamaSearch;

public partial class AppsWindow : Window
{
    private readonly SettingsStore _settings;
    private SiteAppEntry? _selected;
    private bool _refreshing;

    public AppsWindow(SettingsStore settings, string? selectedAppId = null)
    {
        InitializeComponent();
        _settings = settings;
        RenderAppList();

        var selected = !string.IsNullOrWhiteSpace(selectedAppId)
            ? _settings.Data.InstalledApps.FirstOrDefault(x => x.Id == selectedAppId)
            : _settings.Data.InstalledApps.FirstOrDefault();
        SelectApp(selected);
    }

    private void RenderAppList()
    {
        AppList.Children.Clear();
        foreach (var app in _settings.Data.InstalledApps.OrderBy(x => x.Name, StringComparer.CurrentCultureIgnoreCase))
        {
            var row = new Grid();
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(30) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var image = new Image { Width = 20, Height = 20, Stretch = System.Windows.Media.Stretch.Uniform };
            var source = TryLoadIcon(app.IconPath);
            if (source != null) image.Source = source;
            Grid.SetColumn(image, 0);
            row.Children.Add(image);

            var text = new TextBlock
            {
                Text = app.Name,
                TextTrimming = TextTrimming.CharacterEllipsis,
                VerticalAlignment = VerticalAlignment.Center
            };
            Grid.SetColumn(text, 1);
            row.Children.Add(text);

            var button = new Button
            {
                Content = row,
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
                Style = (Style)FindResource("YamaSecondaryButton"),
                Margin = new Thickness(0, 0, 0, 6),
                ToolTip = app.Url
            };
            button.Click += (_, _) => SelectApp(app);
            AppList.Children.Add(button);
        }
    }

    private void SelectApp(SiteAppEntry? app)
    {
        _selected = app;
        EmptyState.Visibility = app == null ? Visibility.Visible : Visibility.Collapsed;
        DetailPanel.Visibility = app == null ? Visibility.Collapsed : Visibility.Visible;
        if (app == null) return;

        _refreshing = true;
        BreadcrumbText.Text = $"Všechny aplikace / {app.Name}";
        DetailName.Text = app.Name;
        DetailPublisher.Text = $"Vydavatel: {app.Host}";
        DetailIcon.Source = TryLoadIcon(app.IconPath)
            ?? new BitmapImage(new Uri("pack://application:,,,/Assets/YamaSearch-symbol-64.png"));
        StartMenuCheck.IsChecked = app.AddToStartMenu;
        DesktopCheck.IsChecked = app.CreateDesktopShortcut;
        StartupCheck.IsChecked = app.StartOnLogin;
        AppUrlText.Text = app.Url;
        InstalledText.Text = $"Nainstalováno {app.InstalledAt:dd.MM.yyyy HH:mm}";
        IntegrationStatus.Text = "";
        _refreshing = false;
    }

    private void IntegrationChanged(object sender, RoutedEventArgs e)
    {
        if (_refreshing || _selected == null) return;

        _selected.AddToStartMenu = StartMenuCheck.IsChecked == true;
        _selected.CreateDesktopShortcut = DesktopCheck.IsChecked == true;
        _selected.StartOnLogin = StartupCheck.IsChecked == true;

        try
        {
            SiteAppServices.ApplyShortcuts(_selected);
            _settings.Save();
            IntegrationStatus.Text = "Nastavení integrace s Windows bylo uloženo.";
        }
        catch (Exception error)
        {
            IntegrationStatus.Text = "Změnu se nepodařilo použít: " + error.Message;
        }
    }

    private void OpenApp_Click(object sender, RoutedEventArgs e)
    {
        if (_selected == null) return;
        StartApp(_selected);
    }

    private void PinTaskbar_Click(object sender, RoutedEventArgs e)
    {
        if (_selected == null) return;
        if (SiteAppServices.TryPinToTaskbar(_selected))
        {
            _settings.Save();
            IntegrationStatus.Text = "Windows obdržel požadavek na připnutí aplikace.";
            return;
        }

        SiteAppServices.OpenShortcutLocation(_selected);
        _settings.Save();
        IntegrationStatus.Text = "Windows nepovolil automatické připnutí. Otevřel jsem zástupce, který můžeš připnout ručně.";
    }

    private void OpenShortcutLocation_Click(object sender, RoutedEventArgs e)
    {
        if (_selected == null) return;
        SiteAppServices.OpenShortcutLocation(_selected);
        _settings.Save();
    }

    private void Uninstall_Click(object sender, RoutedEventArgs e)
    {
        if (_selected == null) return;
        if (MessageBox.Show(
            $"Odinstalovat aplikaci „{_selected.Name}“?\n\nWebová data a přihlášení v YamaSearch tím nebudou smazána.",
            "YamaSearch",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning) != MessageBoxResult.Yes) return;

        SiteAppServices.RemoveAppFiles(_selected);
        _settings.Data.InstalledApps.Remove(_selected);
        _settings.Save();
        RenderAppList();
        SelectApp(_settings.Data.InstalledApps.FirstOrDefault());
    }

    private static void StartApp(SiteAppEntry app)
    {
        var exe = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(exe)) return;
        var start = new ProcessStartInfo(exe) { UseShellExecute = true };
        start.ArgumentList.Add($"--app-id={app.Id}");
        Process.Start(start);
    }

    private static BitmapImage? TryLoadIcon(string? path)
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

    private void ShowAll_Click(object sender, RoutedEventArgs e) => SelectApp(_settings.Data.InstalledApps.FirstOrDefault());
    private void ShowInstalled_Click(object sender, RoutedEventArgs e) => SelectApp(_settings.Data.InstalledApps.FirstOrDefault());
    private void Close_Click(object sender, RoutedEventArgs e) => Close();

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.LeftButton == MouseButtonState.Pressed)
            DragMove();
    }
}
