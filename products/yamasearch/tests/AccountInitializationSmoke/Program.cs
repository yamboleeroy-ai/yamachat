using YamaSearch;

var accounts = new AccountService();
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
