using YamaSearch;

var path = Path.Combine(Environment.CurrentDirectory, ".test-session-preferences-" + Guid.NewGuid().ToString("N"), "preferences.json");
try
{
    if (!AccountSessionPreferenceStore.Read(portalAccount: true, path))
        throw new InvalidOperationException("Legacy default should preserve persistent sessions.");

    AccountSessionPreferenceStore.Write(portalAccount: true, remember: false, path);
    if (AccountSessionPreferenceStore.Read(portalAccount: true, path))
        throw new InvalidOperationException("Opt-out must be saved for the Portal account.");
    if (!AccountSessionPreferenceStore.Read(portalAccount: false, path))
        throw new InvalidOperationException("Portal preference must not change the separate Search account.");

    AccountSessionPreferenceStore.Write(portalAccount: false, remember: false, path);
    AccountSessionPreferenceStore.Write(portalAccount: true, remember: true, path);
    if (!AccountSessionPreferenceStore.Read(portalAccount: true, path)
        || AccountSessionPreferenceStore.Read(portalAccount: false, path))
        throw new InvalidOperationException("Preferences must remain isolated by account system.");

    Console.WriteLine("Session preference persistence and account-system isolation passed.");
    return 0;
}
finally
{
    var directory = Path.GetDirectoryName(path);
    if (directory is not null && Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
}
