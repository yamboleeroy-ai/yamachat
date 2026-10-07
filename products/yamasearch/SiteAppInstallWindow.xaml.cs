using System.Windows;
using System.Windows.Input;
using System.Windows.Media;

namespace YamaSearch;

public partial class SiteAppInstallWindow : Window
{
    public bool AddToStartMenu => StartMenuCheck.IsChecked == true;
    public bool RequestTaskbarPin => TaskbarCheck.IsChecked == true;
    public bool CreateDesktopShortcut => DesktopCheck.IsChecked == true;
    public bool StartOnLogin => StartupCheck.IsChecked == true;

    public SiteAppInstallWindow(string name, string publisher, ImageSource icon)
    {
        InitializeComponent();
        HeadingText.Text = $"Nainstalovat aplikaci {name}";
        PublisherText.Text = $"Vydavatel: {publisher}";
        AppIcon.Source = icon;
    }

    private void Install_Click(object sender, RoutedEventArgs e) => DialogResult = true;
    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.LeftButton == MouseButtonState.Pressed)
            DragMove();
    }
}
