using YamaSearch;

// Exercise the dedicated YamaSearch Supabase project regardless of the
// interactive account-mode preference stored for the current Windows user.
var accounts = new AccountService(usePortalAccount: false);
try
{
    await accounts.InitializeAsync();
    var snapshot = accounts.Snapshot;
    Console.WriteLine($"State={snapshot.State}; SignedIn={snapshot.IsSignedIn}; Providers={snapshot.AvailableProviders.Count}; Identities={snapshot.Identities.Count}; Status={snapshot.StatusText}");
    return snapshot.State == AccountConnectionState.Error ? 1 : 0;
}
catch (Exception error)
{
    Console.Error.WriteLine($"{error.GetType().FullName}: {error.Message}");
    return 2;
}
