using System.Windows;

namespace YamaSearch;

public partial class App : Application
{
    private void Application_Startup(object sender, StartupEventArgs e)
    {
        string? startupUrl = null;
        var appMode = false;

        foreach (var argument in e.Args)
        {
            if (argument.StartsWith("--app=", StringComparison.OrdinalIgnoreCase))
            {
                startupUrl = argument[6..].Trim().Trim('"');
                appMode = true;
            }
            else if (argument.StartsWith("--url=", StringComparison.OrdinalIgnoreCase))
            {
                startupUrl = argument[6..].Trim().Trim('"');
            }
        }

        var window = new MainWindow(startupUrl, appMode);
        MainWindow = window;
        window.Show();
    }
}
