namespace YamaSearch;

public sealed record YamaBlockLogEntry(
    DateTimeOffset Time,
    string Status,
    string Category,
    string Detail);

public static class YamaBlockDiagnostics
{
    private static readonly object Gate = new();
    private static readonly List<YamaBlockLogEntry> Entries = [];

    public static void Add(string status, string category, string detail)
    {
        lock (Gate)
        {
            Entries.Insert(0, new YamaBlockLogEntry(DateTimeOffset.Now, status, category, detail));
            if (Entries.Count > 400)
                Entries.RemoveRange(400, Entries.Count - 400);
        }
    }

    public static IReadOnlyList<YamaBlockLogEntry> Snapshot()
    {
        lock (Gate)
            return Entries.ToList();
    }

    public static void Clear()
    {
        lock (Gate)
            Entries.Clear();
    }
}
