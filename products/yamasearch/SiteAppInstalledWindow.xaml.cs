using System.Windows;
using System.Windows.Input;
using System.Windows.Media;

namespace YamaSearch;

public partial class SiteAppInstalledWindow : Window
{
    public bool OpenRequested { get; private set; }
    public bool SettingsRequested { get; private set; }

    public SiteAppInstalledWindow(SiteAppEntry app, ImageSource icon, bool taskbarPinFailed)
    {
        InitializeComponent();
        AppIcon.Source = icon;
        PublisherText.Text = $"Vydavatel: {app.Host}";
        InstalledText.Text = $"{app.Name} je připravená k použití.";
        TaskbarNotice.Visibility = taskbarPinFailed ? Visibility.Visible : Visibility.Collapsed;
    }

    private void Open_Click(object sender, RoutedEventArgs e)
    {
        OpenRequested = true;
        DialogResult = true;
    }

    private void Settings_Click(object sender, RoutedEventArgs e)
    {
        SettingsRequested = true;
        DialogResult = true;
    }

    private void Close_Click(object sender, RoutedEventArgs e) => DialogResult = false;

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.LeftButton == MouseButtonState.Pressed)
            DragMove();
    }
}
