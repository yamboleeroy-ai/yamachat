using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace YamaSearch;

public enum AccountConnectionState
{
    NotConfigured,
    SignedOut,
    SigningIn,
    SignedIn,
    Offline,
    Error
}

public sealed record AccountProviderSnapshot(string Id, string DisplayName, string Scopes);

public sealed record AccountIdentitySnapshot(string Id, string Provider, string Email);

public sealed record AccountSnapshot(
    AccountConnectionState State,
    string StatusText,
    string DisplayName,
    string Email,
    string AvatarUrl,
    IReadOnlyList<AccountProviderSnapshot> AvailableProviders,
    IReadOnlyList<AccountIdentitySnapshot> Identities)
{
    public bool IsConfigured => State != AccountConnectionState.NotConfigured;
    public bool IsSignedIn => State == AccountConnectionState.SignedIn || (State == AccountConnectionState.Offline && !string.IsNullOrWhiteSpace(Email));

    public static AccountSnapshot NotConfigured { get; } = new(
        AccountConnectionState.NotConfigured,
        "Účet YamaSearch zatím nemá připojený samostatný server.",
        "Nepřihlášený uživatel",
        "",
        "",
        [],
        []);
}

public sealed class AccountService
{
    private static readonly HttpClient Client = new(new SocketsHttpHandler
    {
        AutomaticDecompression = DecompressionMethods.All,
        PooledConnectionLifetime = TimeSpan.FromMinutes(10)
    })
    {
        Timeout = TimeSpan.FromSeconds(35)
    };

    private readonly SemaphoreSlim _stateGate = new(1, 1);
    private readonly SemaphoreSlim _oauthGate = new(1, 1);
    private AccountBackendConfig _config = AccountBackendConfig.Empty;
    private AccountSession? _session;
    private bool _initialized;
    private AccountSnapshot _snapshot = AccountSnapshot.NotConfigured;

    public AccountSnapshot Snapshot => _snapshot;
    public bool CanLinkIdentities => _config.ManualIdentityLinkingEnabled;
    public bool CanUnlinkIdentities => false;
    public event EventHandler? StateChanged;

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await _stateGate.WaitAsync(cancellationToken);
        var completed = true;
        IReadOnlyList<AccountProviderSnapshot> discoveredProviders = [];
        CachedAccountProfile? cachedProfile = null;
        try
        {
            if (_initialized) return;
            _config = AccountBackendConfig.Load();
            if (!_config.IsConfigured)
            {
                Publish(AccountSnapshot.NotConfigured);
                return;
            }

            cachedProfile = AccountProfileCache.Read();

            try
            {
                discoveredProviders = await DiscoverProvidersAsync(cancellationToken);
            }
            catch (Exception error) when (IsNetworkFailure(error))
            {
                Publish(OfflineSnapshot(cachedProfile, [], "Server účtu je momentálně nedostupný. Uložené přihlášení zůstává zachované."));
                return;
            }

            var refreshToken = WindowsCredentialStore.Read(CredentialTarget());
            if (string.IsNullOrWhiteSpace(refreshToken))
            {
                Publish(SignedOutSnapshot(discoveredProviders));
                return;
            }

            try
            {
                var token = await RefreshWithCrossProcessLockAsync(refreshToken, cancellationToken);
                ApplySession(token, discoveredProviders);
            }
            catch (AccountApiException error) when (error.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                WindowsCredentialStore.Delete(CredentialTarget());
                AccountProfileCache.Delete();
                Publish(SignedOutSnapshot(discoveredProviders) with { StatusText = "Uložená relace vypršela. Přihlaste se znovu." });
            }
            catch (Exception error) when (IsNetworkFailure(error))
            {
                Publish(OfflineSnapshot(cachedProfile, discoveredProviders, "Relaci teď nelze ověřit kvůli síti. Uložené přihlášení zůstává zachované."));
            }
        }
        catch (OperationCanceledException)
        {
            completed = false;
            throw;
        }
        catch (Exception error)
        {
            AccountDiagnostics.Write("initialize", error);
            Publish(cachedProfile is not null
                ? OfflineSnapshot(cachedProfile, discoveredProviders, $"Uložené přihlášení zůstává zachované, ale ověření selhalo: {SafeMessage(error)}")
                : new AccountSnapshot(
                    IsNetworkFailure(error) ? AccountConnectionState.Offline : AccountConnectionState.Error,
                    SafeMessage(error),
                    "Nepřihlášený uživatel",
                    "",
                    "",
                    discoveredProviders,
                    []));
        }
        finally
        {
            _initialized = completed;
            _stateGate.Release();
        }
    }

    public async Task RetryAsync(CancellationToken cancellationToken = default)
    {
        await _stateGate.WaitAsync(cancellationToken);
        IReadOnlyList<AccountProviderSnapshot> discoveredProviders = _snapshot.AvailableProviders;
        try
        {
            _config = AccountBackendConfig.Load();
            if (!_config.IsConfigured)
            {
                Publish(AccountSnapshot.NotConfigured);
                return;
            }

            discoveredProviders = await DiscoverProvidersAsync(cancellationToken);
            var refreshToken = WindowsCredentialStore.Read(CredentialTarget());
            if (string.IsNullOrWhiteSpace(refreshToken))
            {
                Publish(SignedOutSnapshot(discoveredProviders));
                return;
            }

            var token = await RefreshWithCrossProcessLockAsync(refreshToken, cancellationToken);
            ApplySession(token, discoveredProviders);
        }
        catch (Exception error)
        {
            AccountDiagnostics.Write("retry", error);
            Publish(_snapshot with
            {
                State = IsNetworkFailure(error) ? AccountConnectionState.Offline : AccountConnectionState.Error,
                StatusText = SafeMessage(error),
                AvailableProviders = discoveredProviders
            });
            throw;
        }
        finally
        {
            _stateGate.Release();
        }
    }

    public async Task SignInAsync(AccountProviderSnapshot provider, CancellationToken cancellationToken = default)
    {
        await InitializeAsync(cancellationToken);
        if (!_config.IsConfigured)
            throw new InvalidOperationException("Samostatný server účtu YamaSearch zatím není nastavený.");
        if (!_snapshot.AvailableProviders.Any(item => item.Id.Equals(provider.Id, StringComparison.Ordinal)))
            throw new InvalidOperationException("Tento poskytovatel není na serveru YamaSearch aktivní.");

        await _oauthGate.WaitAsync(cancellationToken);
        try
        {
            Publish(_snapshot with { State = AccountConnectionState.SigningIn, StatusText = $"Čekám na přihlášení přes {provider.DisplayName}…" });
            var token = await RunOAuthFlowAsync(provider, linkIdentity: false, cancellationToken);
            ApplySession(token, _snapshot.AvailableProviders);
        }
        catch (OperationCanceledException)
        {
            Publish(SignedOutSnapshot(_snapshot.AvailableProviders) with { StatusText = "Přihlášení bylo zrušeno." });
            throw;
        }
        catch (Exception error)
        {
            Publish(SignedOutSnapshot(_snapshot.AvailableProviders) with
            {
                State = IsNetworkFailure(error) ? AccountConnectionState.Offline : AccountConnectionState.Error,
                StatusText = SafeMessage(error)
            });
            throw;
        }
        finally
        {
            _oauthGate.Release();
        }
    }

    public async Task LinkIdentityAsync(AccountProviderSnapshot provider, CancellationToken cancellationToken = default)
    {
        if (!CanLinkIdentities)
            throw new InvalidOperationException("Propojování identit není na serveru YamaSearch ověřené a zůstává vypnuté.");
        await _oauthGate.WaitAsync(cancellationToken);
        var previous = _snapshot;
        try
        {
            await EnsureSessionAsync(cancellationToken);
            if (_session is null) throw new InvalidOperationException("Nejdřív se přihlaste k účtu YamaSearch.");
            if (previous.Identities.Any(identity => ProviderMatches(identity.Provider, provider.Id)))
                throw new InvalidOperationException("Tento účet už je s profilem propojený.");

            Publish(previous with { State = AccountConnectionState.SigningIn, StatusText = $"Propojuji účet {provider.DisplayName}…" });
            var token = await RunOAuthFlowAsync(provider, linkIdentity: true, cancellationToken);
            ApplySession(token, previous.AvailableProviders);
        }
        catch (Exception error)
        {
            Publish(previous with { StatusText = SafeMessage(error) });
            throw;
        }
        finally
        {
            _oauthGate.Release();
        }
    }

    public async Task UnlinkIdentityAsync(AccountIdentitySnapshot identity, CancellationToken cancellationToken = default)
    {
        if (!CanUnlinkIdentities)
            throw new InvalidOperationException("Odpojení účtu vyžaduje čerstvé ověření identity a zatím zůstává bezpečně vypnuté.");
        await _stateGate.WaitAsync(cancellationToken);
        try
        {
            await EnsureSessionCoreAsync(cancellationToken);
            if (_session is null) throw new InvalidOperationException("Nejdřív se přihlaste k účtu YamaSearch.");
            if (_snapshot.Identities.Count <= 1)
                throw new InvalidOperationException("Poslední způsob přihlášení nelze odpojit.");

            using var request = CreateRequest(HttpMethod.Delete, $"user/identities/{Uri.EscapeDataString(identity.Id)}", _session.AccessToken);
            using var response = await Client.SendAsync(request, cancellationToken);
            await EnsureSuccessAsync(response, cancellationToken);
            var user = await GetUserAsync(_session.AccessToken, cancellationToken);
            _session = _session with { User = user };
            Publish(CreateSignedInSnapshot(_session, _snapshot.AvailableProviders, "Propojení bylo bezpečně odebráno."));
        }
        finally
        {
            _stateGate.Release();
        }
    }

    public async Task SignOutAsync(CancellationToken cancellationToken = default)
    {
        await _stateGate.WaitAsync(cancellationToken);
        try
        {
            if (_config.IsConfigured && _session is not null)
            {
                try
                {
                    using var request = CreateRequest(HttpMethod.Post, "logout?scope=local", _session.AccessToken);
                    using var response = await Client.SendAsync(request, cancellationToken);
                    if (response.StatusCode is not HttpStatusCode.Unauthorized and not HttpStatusCode.Forbidden)
                        await EnsureSuccessAsync(response, cancellationToken);
                }
                catch (Exception error) when (IsNetworkFailure(error) || error is AccountApiException)
                {
                    // Local sign-out must always finish. A failed server revocation is surfaced
                    // by the short access-token lifetime and the refresh token is removed below.
                }
            }

            _session = null;
            if (_config.IsConfigured) WindowsCredentialStore.Delete(CredentialTarget());
            AccountProfileCache.Delete();
            Publish(_config.IsConfigured ? SignedOutSnapshot(_snapshot.AvailableProviders) : AccountSnapshot.NotConfigured);
        }
        finally
        {
            _stateGate.Release();
        }
    }

    private async Task EnsureSessionAsync(CancellationToken cancellationToken)
    {
        await _stateGate.WaitAsync(cancellationToken);
        try { await EnsureSessionCoreAsync(cancellationToken); }
        finally { _stateGate.Release(); }
    }

    private async Task EnsureSessionCoreAsync(CancellationToken cancellationToken)
    {
        if (_session is not null && _session.ExpiresAt > DateTimeOffset.UtcNow.AddMinutes(1)) return;
        var refreshToken = _session?.RefreshToken ?? WindowsCredentialStore.Read(CredentialTarget());
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            _session = null;
            throw new InvalidOperationException("Přihlášení vypršelo. Přihlaste se znovu.");
        }

        var token = await RefreshWithCrossProcessLockAsync(refreshToken, cancellationToken);
        ApplySession(token, _snapshot.AvailableProviders);
    }

    private async Task<SupabaseTokenResponse> RunOAuthFlowAsync(AccountProviderSnapshot provider, bool linkIdentity, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromMinutes(5));

        var verifier = Base64Url(RandomNumberGenerator.GetBytes(48));
        var challenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        var callbackNonce = Base64Url(RandomNumberGenerator.GetBytes(24));
        var callbackPath = $"/yamasearch-auth/{callbackNonce}/";
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start(1);
        var completionPageOwnsListener = false;

        try
        {
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            var redirectUrl = $"http://127.0.0.1:{port}{callbackPath}";
            var authorizePath = linkIdentity ? "user/identities/authorize" : "authorize";
            var authorizeUrl = BuildAuthorizeUrl(authorizePath, provider, redirectUrl, challenge, linkIdentity);

            if (linkIdentity)
            {
                if (_session is null) throw new InvalidOperationException("Přihlášení vypršelo.");
                using var request = CreateRequest(HttpMethod.Get, authorizeUrl, _session.AccessToken, pathIsAbsolute: true);
                using var response = await Client.SendAsync(request, timeout.Token);
                await EnsureSuccessAsync(response, timeout.Token);
                using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));
                if (!json.RootElement.TryGetProperty("url", out var urlElement) || string.IsNullOrWhiteSpace(urlElement.GetString()))
                    throw new InvalidOperationException("Server nevrátil bezpečnou adresu pro propojení účtu.");
                var returnedUrl = urlElement.GetString()!;
                if (!Uri.TryCreate(returnedUrl, UriKind.Absolute, out var returnedUri)
                    || !returnedUri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("Server vrátil nepovolenou adresu pro propojení účtu.");
                authorizeUrl = returnedUri.AbsoluteUri;
            }

            Process.Start(new ProcessStartInfo(authorizeUrl) { UseShellExecute = true });
            var callback = await ReceiveLoopbackCallbackAsync(listener, callbackPath, timeout.Token);
            completionPageOwnsListener = true;
            _ = KeepLoopbackCompletionPageAliveAsync(listener, callbackPath, callback.Code is not null);
            if (!string.IsNullOrWhiteSpace(callback.Error))
                throw new InvalidOperationException(callback.ErrorDescription ?? "Přihlášení poskytovatel odmítl.");
            if (string.IsNullOrWhiteSpace(callback.Code))
                throw new InvalidOperationException("Přihlášení se vrátilo bez autorizačního kódu.");

            using var tokenRequest = CreateRequest(HttpMethod.Post, "token?grant_type=pkce");
            tokenRequest.Content = JsonContent.Create(new { auth_code = callback.Code, code_verifier = verifier });
            using var tokenResponse = await Client.SendAsync(tokenRequest, timeout.Token);
            await EnsureSuccessAsync(tokenResponse, timeout.Token);
            return await ReadTokenAsync(tokenResponse, timeout.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException("Přihlášení nebylo dokončeno do pěti minut.");
        }
        finally
        {
            if (!completionPageOwnsListener)
                listener.Stop();
        }
    }

    private string BuildAuthorizeUrl(string path, AccountProviderSnapshot provider, string redirectUrl, string challenge, bool returnJson)
    {
        var values = new List<KeyValuePair<string, string>>
        {
            new("provider", provider.Id),
            new("redirect_to", redirectUrl),
            new("code_challenge", challenge),
            new("code_challenge_method", "s256")
        };
        if (!string.IsNullOrWhiteSpace(provider.Scopes)) values.Add(new("scopes", provider.Scopes));
        if (returnJson) values.Add(new("skip_http_redirect", "true"));
        var query = string.Join("&", values.Select(pair => $"{Uri.EscapeDataString(pair.Key)}={Uri.EscapeDataString(pair.Value)}"));
        return new Uri(_config.AuthBaseUri, path).AbsoluteUri + "?" + query;
    }

    private static async Task<LoopbackResult> ReceiveLoopbackCallbackAsync(TcpListener listener, string expectedPath, CancellationToken cancellationToken)
    {
        using var client = await listener.AcceptTcpClientAsync(cancellationToken);
        await using var stream = client.GetStream();
        using var reader = new StreamReader(stream, Encoding.ASCII, false, 4096, leaveOpen: true);
        var requestLine = await reader.ReadLineAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(requestLine)) throw new InvalidOperationException("Neplatná odpověď přihlášení.");

        string? line;
        do { line = await reader.ReadLineAsync(cancellationToken); }
        while (!string.IsNullOrEmpty(line));

        var parts = requestLine.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2 || !parts[0].Equals("GET", StringComparison.Ordinal))
            throw new InvalidOperationException("Neplatná metoda návratu přihlášení.");

        var requestUri = new Uri("http://127.0.0.1" + parts[1]);
        if (!requestUri.AbsolutePath.Equals(expectedPath, StringComparison.Ordinal))
            throw new InvalidOperationException("Návrat přihlášení neodpovídá zahájenému požadavku.");

        var query = ParseQuery(requestUri.Query);
        var succeeded = query.TryGetValue("code", out var code) && !string.IsNullOrWhiteSpace(code);
        await WriteLoopbackCompletionPageAsync(stream, succeeded, cancellationToken);

        return new LoopbackResult(
            code,
            query.GetValueOrDefault("error"),
            query.GetValueOrDefault("error_description"));
    }

    private static async Task KeepLoopbackCompletionPageAliveAsync(TcpListener listener, string expectedPath, bool succeeded)
    {
        using var lifetime = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try
        {
            while (!lifetime.IsCancellationRequested)
            {
                using var client = await listener.AcceptTcpClientAsync(lifetime.Token);
                await using var stream = client.GetStream();
                using var reader = new StreamReader(stream, Encoding.ASCII, false, 4096, leaveOpen: true);
                var requestLine = await reader.ReadLineAsync(lifetime.Token);
                string? line;
                do { line = await reader.ReadLineAsync(lifetime.Token); }
                while (!string.IsNullOrEmpty(line));

                var parts = requestLine?.Split(' ', StringSplitOptions.RemoveEmptyEntries) ?? [];
                if (parts.Length >= 2 && parts[0].Equals("GET", StringComparison.Ordinal))
                {
                    var requestUri = new Uri("http://127.0.0.1" + parts[1]);
                    if (requestUri.AbsolutePath.Equals(expectedPath, StringComparison.Ordinal))
                        await WriteLoopbackCompletionPageAsync(stream, succeeded, lifetime.Token);
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (ObjectDisposedException) { }
        catch (SocketException) { }
        finally
        {
            listener.Stop();
        }
    }

    private static async Task WriteLoopbackCompletionPageAsync(NetworkStream stream, bool succeeded, CancellationToken cancellationToken)
    {
        var title = succeeded ? "Přihlášení dokončeno" : "Přihlášení nebylo dokončeno";
        var message = succeeded
            ? "Účet byl bezpečně připojen. Tuto kartu můžete zavřít a vrátit se do YamaSearch."
            : "Vraťte se do YamaSearch, kde uvidíte podrobnosti.";
        var body = $"<!doctype html><html lang='cs'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width'><meta name='color-scheme' content='dark'><title>{title}</title><style>body{{margin:0;background:#08111d;color:#eaf3ff;font-family:Segoe UI,Arial;display:grid;place-items:center;min-height:100vh}}main{{width:min(520px,86vw);padding:34px;border:1px solid #245a84;border-radius:18px;background:#14243a;box-shadow:0 24px 70px #0008}}h1{{color:#42d8ff;font-size:24px}}p{{color:#b9cee4;line-height:1.55}}</style></head><body><main><h1>{title}</h1><p>{message}</p></main></body></html>";
        var bytes = Encoding.UTF8.GetBytes(body);
        var headers = Encoding.ASCII.GetBytes($"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {bytes.Length}\r\nConnection: close\r\nCache-Control: no-store, no-cache, must-revalidate\r\nPragma: no-cache\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\n\r\n");
        await stream.WriteAsync(headers, cancellationToken);
        await stream.WriteAsync(bytes, cancellationToken);
        await stream.FlushAsync(cancellationToken);
    }

    private async Task<IReadOnlyList<AccountProviderSnapshot>> DiscoverProvidersAsync(CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Get, "settings");
        using var response = await Client.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        var external = json.RootElement.TryGetProperty("external", out var externalElement)
            ? externalElement
            : default;

        var providers = new List<AccountProviderSnapshot>();
        foreach (var configured in _config.Providers.Where(provider => provider.Enabled))
        {
            var enabled = configured.Id.StartsWith("custom:", StringComparison.Ordinal)
                ? configured.Enabled && configured.ServerVerified
                : external.ValueKind == JsonValueKind.Object
                    && external.TryGetProperty(configured.Id, out var flag)
                    && flag.ValueKind == JsonValueKind.True;
            if (enabled)
                providers.Add(new AccountProviderSnapshot(configured.Id, configured.DisplayName, configured.Scopes));
        }
        return providers;
    }

    private async Task<SupabaseTokenResponse> RefreshWithCrossProcessLockAsync(string refreshToken, CancellationToken cancellationToken)
    {
        // Mutex ownership is thread-affine. An async continuation can resume on a
        // different pool thread, making ReleaseMutex throw even after a successful
        // refresh. A named semaphore provides the same cross-process serialization
        // without thread affinity.
        using var refreshGate = new Semaphore(1, 1, "Local\\YamaSearch.Account.Refresh");
        var lockTaken = false;
        try
        {
            lockTaken = await Task.Run(() =>
            {
                return refreshGate.WaitOne(TimeSpan.FromSeconds(30));
            }, cancellationToken);
            if (!lockTaken) throw new TimeoutException("Obnovení relace blokuje jiný proces YamaSearch.");

            refreshToken = WindowsCredentialStore.Read(CredentialTarget()) ?? refreshToken;
            using var request = CreateRequest(HttpMethod.Post, "token?grant_type=refresh_token");
            request.Content = JsonContent.Create(new { refresh_token = refreshToken });
            using var response = await Client.SendAsync(request, cancellationToken);
            await EnsureSuccessAsync(response, cancellationToken);
            return await ReadTokenAsync(response, cancellationToken);
        }
        finally
        {
            if (lockTaken) refreshGate.Release();
        }
    }

    private async Task<SupabaseUser> GetUserAsync(string accessToken, CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Get, "user", accessToken);
        using var response = await Client.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
        return await response.Content.ReadFromJsonAsync<SupabaseUser>(JsonOptions, cancellationToken)
            ?? throw new InvalidOperationException("Server nevrátil profil uživatele.");
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string path, string? accessToken = null, bool pathIsAbsolute = false)
    {
        var uri = pathIsAbsolute ? new Uri(path) : new Uri(_config.AuthBaseUri, path);
        if (!uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            var isLoopback = uri.IsLoopback && uri.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase);
            if (!isLoopback) throw new InvalidOperationException("Server účtu musí používat zabezpečené HTTPS.");
        }

        var request = new HttpRequestMessage(method, uri);
        request.Headers.TryAddWithoutValidation("apikey", _config.PublishableKey);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken ?? _config.PublishableKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return request;
    }

    private void ApplySession(SupabaseTokenResponse token, IReadOnlyList<AccountProviderSnapshot> providers)
    {
        if (string.IsNullOrWhiteSpace(token.AccessToken) || string.IsNullOrWhiteSpace(token.RefreshToken) || token.User is null)
            throw new InvalidOperationException("Server vrátil neúplnou přihlašovací relaci.");
        var expiresAt = token.ExpiresAt is > 0
            ? DateTimeOffset.FromUnixTimeSeconds(token.ExpiresAt.Value)
            : DateTimeOffset.UtcNow.AddSeconds(Math.Max(60, token.ExpiresIn));
        _session = new AccountSession(token.AccessToken, token.RefreshToken, expiresAt, token.User);
        WindowsCredentialStore.Write(CredentialTarget(), token.RefreshToken);
        var snapshot = CreateSignedInSnapshot(_session, providers, "Účet je přihlášený a relace je bezpečně uložená ve Windows.");
        AccountProfileCache.Write(snapshot);
        Publish(snapshot);
    }

    private static AccountSnapshot CreateSignedInSnapshot(AccountSession session, IReadOnlyList<AccountProviderSnapshot> providers, string status)
    {
        var metadata = session.User.UserMetadata;
        var displayName = ReadMetadata(metadata, "full_name", "name", "user_name");
        if (string.IsNullOrWhiteSpace(displayName)) displayName = session.User.Email ?? "Uživatel YamaSearch";
        var avatar = ReadMetadata(metadata, "avatar_url", "picture");
        var identities = (session.User.Identities ?? [])
            .Where(identity => !string.IsNullOrWhiteSpace(identity.IdentityId))
            .Select(identity => new AccountIdentitySnapshot(
                identity.IdentityId!,
                identity.Provider ?? "účet",
                ReadIdentityEmail(identity) ?? session.User.Email ?? ""))
            .ToList();
        return new AccountSnapshot(
            AccountConnectionState.SignedIn,
            status,
            displayName!,
            session.User.Email ?? "",
            avatar ?? "",
            providers,
            identities);
    }

    private AccountSnapshot SignedOutSnapshot(IReadOnlyList<AccountProviderSnapshot> providers) => new(
        AccountConnectionState.SignedOut,
        providers.Count > 0 ? "Vyberte bezpečný způsob přihlášení." : "Na serveru zatím není aktivní žádný podporovaný poskytovatel.",
        "Nepřihlášený uživatel",
        "",
        "",
        providers,
        []);

    private static AccountSnapshot OfflineSnapshot(
        CachedAccountProfile? cached,
        IReadOnlyList<AccountProviderSnapshot> providers,
        string status) => cached is null
        ? new AccountSnapshot(AccountConnectionState.Offline, status, "Nepřihlášený uživatel", "", "", providers, [])
        : new AccountSnapshot(
            AccountConnectionState.Offline,
            status,
            cached.DisplayName,
            cached.Email,
            cached.AvatarUrl,
            providers,
            cached.Identities);

    private void Publish(AccountSnapshot snapshot)
    {
        _snapshot = snapshot;
        StateChanged?.Invoke(this, EventArgs.Empty);
    }

    private string CredentialTarget()
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(_config.AuthBaseUri.AbsoluteUri));
        return "YamaSearch.Account." + Convert.ToHexString(hash.AsSpan(0, 12));
    }

    private static async Task<SupabaseTokenResponse> ReadTokenAsync(HttpResponseMessage response, CancellationToken cancellationToken)
        => await response.Content.ReadFromJsonAsync<SupabaseTokenResponse>(JsonOptions, cancellationToken)
            ?? throw new InvalidOperationException("Server nevrátil přihlašovací relaci.");

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode) return;
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        var message = "Požadavek účtu se nepodařilo dokončit.";
        try
        {
            using var json = JsonDocument.Parse(raw);
            foreach (var property in new[] { "message", "msg", "error_description", "error" })
            {
                if (json.RootElement.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString()))
                {
                    message = value.GetString()!;
                    break;
                }
            }
        }
        catch (JsonException) { }
        throw new AccountApiException(response.StatusCode, message);
    }

    private static Dictionary<string, string> ParseQuery(string query)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var pair in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = pair.IndexOf('=');
            var key = separator < 0 ? pair : pair[..separator];
            var value = separator < 0 ? "" : pair[(separator + 1)..];
            result[Uri.UnescapeDataString(key.Replace('+', ' '))] = Uri.UnescapeDataString(value.Replace('+', ' '));
        }
        return result;
    }

    private static string Base64Url(byte[] bytes)
        => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static bool ProviderMatches(string identityProvider, string configuredProvider)
        => identityProvider.Equals(configuredProvider, StringComparison.Ordinal)
            || (configuredProvider.Equals("azure", StringComparison.Ordinal) && identityProvider.Equals("azure", StringComparison.Ordinal))
            || (configuredProvider.StartsWith("custom:", StringComparison.Ordinal) && identityProvider.Equals(configuredProvider, StringComparison.Ordinal));

    private static string? ReadMetadata(JsonElement metadata, params string[] names)
    {
        if (metadata.ValueKind != JsonValueKind.Object) return null;
        foreach (var name in names)
            if (metadata.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString()))
                return value.GetString();
        return null;
    }

    private static string? ReadIdentityEmail(SupabaseIdentity identity)
    {
        if (identity.IdentityData.ValueKind == JsonValueKind.Object
            && identity.IdentityData.TryGetProperty("email", out var email)
            && email.ValueKind == JsonValueKind.String)
            return email.GetString();
        return null;
    }

    private static string SafeMessage(Exception error) => error switch
    {
        AccountApiException api => api.Message,
        TimeoutException timeout => timeout.Message,
        System.ComponentModel.Win32Exception windows => windows.Message,
        JsonException => "Server vrátil nečitelnou odpověď. Uložené přihlášení nebylo odstraněno.",
        OperationCanceledException => "Operace byla zrušena.",
        _ when IsNetworkFailure(error) => "Server účtu je momentálně nedostupný. Zkuste to znovu později.",
        _ => "Operaci účtu se nepodařilo bezpečně dokončit."
    };

    private static bool IsNetworkFailure(Exception error)
        => error is HttpRequestException or IOException or SocketException or TaskCanceledException;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private sealed record LoopbackResult(string? Code, string? Error, string? ErrorDescription);
    private sealed record AccountSession(string AccessToken, string RefreshToken, DateTimeOffset ExpiresAt, SupabaseUser User);
}

internal sealed class AccountBackendConfig
{
    public string BackendUrl { get; set; } = "";
    public string PublishableKey { get; set; } = "";
    public List<AccountProviderConfig> Providers { get; set; } = [];
    public bool ManualIdentityLinkingEnabled { get; set; }

    [JsonIgnore]
    public bool IsConfigured
        => Uri.TryCreate(BackendUrl, UriKind.Absolute, out var uri)
            && uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(PublishableKey)
            && Providers.Count > 0;

    [JsonIgnore]
    public Uri AuthBaseUri => new(new Uri(BackendUrl.TrimEnd('/') + "/"), "auth/v1/");

    public static AccountBackendConfig Empty { get; } = new();

    public static AccountBackendConfig Load()
    {
        var environmentUrl = Environment.GetEnvironmentVariable("YAMASEARCH_ACCOUNT_URL");
        var environmentKey = Environment.GetEnvironmentVariable("YAMASEARCH_ACCOUNT_PUBLISHABLE_KEY");
        var environmentProviders = Environment.GetEnvironmentVariable("YAMASEARCH_ACCOUNT_PROVIDERS");
        if (!string.IsNullOrWhiteSpace(environmentUrl) && !string.IsNullOrWhiteSpace(environmentKey))
        {
            return new AccountBackendConfig
            {
                BackendUrl = environmentUrl.Trim(),
                PublishableKey = environmentKey.Trim(),
                Providers = ParseEnvironmentProviders(environmentProviders)
            };
        }

        var path = Path.Combine(AppContext.BaseDirectory, "account-backend.json");
        if (!File.Exists(path)) return Empty;
        try
        {
            return JsonSerializer.Deserialize<AccountBackendConfig>(File.ReadAllText(path), new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? Empty;
        }
        catch (JsonException)
        {
            return Empty;
        }
    }

    private static List<AccountProviderConfig> ParseEnvironmentProviders(string? value)
    {
        var providers = new List<AccountProviderConfig>();
        foreach (var id in (value ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            providers.Add(id switch
            {
                "google" => new AccountProviderConfig { Id = "google", DisplayName = "Google", Enabled = true },
                "azure" => new AccountProviderConfig { Id = "azure", DisplayName = "Microsoft", Scopes = "email", Enabled = true },
                "custom:seznam" => new AccountProviderConfig { Id = "custom:seznam", DisplayName = "Seznam.cz", Scopes = "identity", Enabled = true, ServerVerified = false },
                "apple" => new AccountProviderConfig { Id = "apple", DisplayName = "Apple", Enabled = true },
                _ => new AccountProviderConfig { Id = id, DisplayName = id, Enabled = true }
            });
        }
        return providers;
    }
}

internal sealed class AccountProviderConfig
{
    public string Id { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Scopes { get; set; } = "";
    public bool Enabled { get; set; }
    public bool ServerVerified { get; set; }
}

internal sealed class SupabaseTokenResponse
{
    [JsonPropertyName("access_token")] public string AccessToken { get; set; } = "";
    [JsonPropertyName("refresh_token")] public string RefreshToken { get; set; } = "";
    [JsonPropertyName("expires_in")] public long ExpiresIn { get; set; }
    [JsonPropertyName("expires_at")] public long? ExpiresAt { get; set; }
    [JsonPropertyName("user")] public SupabaseUser? User { get; set; }
}

internal sealed class SupabaseUser
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("email")] public string? Email { get; set; }
    [JsonPropertyName("user_metadata")] public JsonElement UserMetadata { get; set; }
    [JsonPropertyName("identities")] public List<SupabaseIdentity>? Identities { get; set; }
}

internal sealed class SupabaseIdentity
{
    [JsonPropertyName("identity_id")] public string? IdentityId { get; set; }
    [JsonPropertyName("provider")] public string? Provider { get; set; }
    [JsonPropertyName("identity_data")] public JsonElement IdentityData { get; set; }
}

internal sealed class AccountApiException : Exception
{
    public AccountApiException(HttpStatusCode statusCode, string message) : base(message) => StatusCode = statusCode;
    public HttpStatusCode StatusCode { get; }
}
