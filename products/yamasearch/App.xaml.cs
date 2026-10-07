using System.Windows;

namespace YamaSearch;

public partial class App : Application
{
    private void Application_Startup(object sender, StartupEventArgs e)
    {
        string? startupUrl = null;
        string? siteAppId = null;
        string? manageAppId = null;
        var appMode = false;

        foreach (var argument in e.Args)
        {
            if (argument.StartsWith("--app-id=", StringComparison.OrdinalIgnoreCase))
            {
                siteAppId = argument[9..].Trim().Trim('"');
                appMode = true;
            }
            else if (argument.StartsWith("--manage-app=", StringComparison.OrdinalIgnoreCase))
            {
                manageAppId = argument[13..].Trim().Trim('"');
            }
            else if (argument.StartsWith("--app=", StringComparison.OrdinalIgnoreCase))
            {
                startupUrl = argument[6..].Trim().Trim('"');
                appMode = true;
            }
            else if (argument.StartsWith("--url=", StringComparison.OrdinalIgnoreCase))
            {
                startupUrl = argument[6..].Trim().Trim('"');
            }
        }

        if (!string.IsNullOrWhiteSpace(siteAppId))
        {
            var settings = new SettingsStore();
            var app = settings.Data.InstalledApps.FirstOrDefault(x => x.Id == siteAppId);
            if (app != null)
            {
                startupUrl = app.Url;
            }
            else
            {
                siteAppId = null;
                appMode = false;
            }
        }

        var window = new MainWindow(startupUrl, appMode, siteAppId, manageAppId);
        MainWindow = window;
        window.Show();
    }
}
