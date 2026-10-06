using System.Windows;
using System.Windows.Input;

namespace YamaSearch;

public partial class FindWindow : Window
{
    public string Query => QueryBox.Text.Trim();

    public FindWindow(string? initialQuery = null)
    {
        InitializeComponent();
        QueryBox.Text = initialQuery ?? "";
        Loaded += (_, _) =>
        {
            QueryBox.Focus();
            QueryBox.SelectAll();
        };
    }

    private void Find_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(Query))
            return;
        DialogResult = true;
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;

    private void QueryBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter) return;
        e.Handled = true;
        Find_Click(sender, e);
    }
}
