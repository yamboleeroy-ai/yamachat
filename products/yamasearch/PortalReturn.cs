using System.Net.Http;
namespace YamaSearch;

// A capability passed only to a child launched by the running Portal. No account tokens.
internal static class PortalReturn
{
    private static readonly string? Origin = Environment.GetEnvironmentVariable("YAMAPORTAL_RETURN_ORIGIN");
    private static readonly string? Token = Environment.GetEnvironmentVariable("YAMAPORTAL_RETURN_TOKEN");
    internal static bool Available => Uri.TryCreate(Origin, UriKind.Absolute, out var uri)
        && uri.Scheme == "http" && uri.Host == "127.0.0.1" && uri.Port == 4188
        && uri.AbsolutePath == "/" && string.IsNullOrEmpty(uri.Query) && string.IsNullOrEmpty(uri.Fragment)
        && Token is { Length: 64 } && Token.All(Uri.IsHexDigit);
    internal static async Task<bool> TryReturnAsync()
    {
        if (!Available) return false;
        try
        {
            using var handler = new HttpClientHandler { UseProxy = false, AllowAutoRedirect = false };
            using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(2) };
            using var request = new HttpRequestMessage(HttpMethod.Post, Origin + "/portal-return");
            request.Headers.Add("X-Yamaportal-Return", Token);
            using var response = await client.SendAsync(request);
            return response.StatusCode == System.Net.HttpStatusCode.NoContent;
        }
        catch (HttpRequestException) { return false; }
        catch (TaskCanceledException) { return false; }
    }
}
