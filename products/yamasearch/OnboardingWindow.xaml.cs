using System.Windows;

namespace YamaSearch;
public partial class OnboardingWindow : Window
{
    private readonly SettingsStore _settings;
    public OnboardingWindow(SettingsStore settings)
    {
        InitializeComponent(); _settings = settings;
        DuckDuckGo.IsChecked = true; NewTab.IsChecked = true;
    }
    private void Finish_Click(object sender, RoutedEventArgs e)
    {
        var data = _settings.Data;
        data.SearchEngine = Google.IsChecked == true ? "Google" : Seznam.IsChecked == true ? "Seznam" : Bing.IsChecked == true ? "Bing" : DuckDuckGo.IsChecked == true ? "DuckDuckGo" : BraveSearch.IsChecked == true ? "Brave Search" : Ecosia.IsChecked == true ? "Ecosia" : Yahoo.IsChecked == true ? "Yahoo" : Startpage.IsChecked == true ? "Startpage" : "Custom";
        if (CustomSearch.IsChecked == true && (!Uri.TryCreate(CustomSearchUrl.Text.Replace("{query}", "test"), UriKind.Absolute, out var search) || (search.Scheme != "https" && search.Scheme != "http") || !CustomSearchUrl.Text.Contains("{query}"))) { MessageBox.Show("Vlastní vyhledávač musí být platná HTTP(S) adresa s {query} pro hledaný text.", "YamaSearch"); return; }
        if (CustomSearch.IsChecked == true) data.CustomSearchEndpoint = CustomSearchUrl.Text.Trim();
        data.HomePage = NewTab.IsChecked == true ? "yamasearch://newtab" : HomeGoogle.IsChecked == true ? "https://www.google.com/" : HomeSeznam.IsChecked == true ? "https://search.seznam.cz/" : CustomHomeUrl.Text.Trim();
        if (CustomHome.IsChecked == true && (!Uri.TryCreate(data.HomePage, UriKind.Absolute, out var home) || (home.Scheme != "https" && home.Scheme != "http"))) { MessageBox.Show("Vlastní úvodní stránka musí být platná HTTP(S) adresa.", "YamaSearch"); return; }
        data.OnboardingCompleted = true; DialogResult = true;
    }
}
