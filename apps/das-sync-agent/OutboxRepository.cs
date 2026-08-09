using Microsoft.Data.Sqlite;

namespace TradingJournal.DasSync;

internal sealed record PendingSnapshot(
    long Id,
    string FileName,
    byte[] Content,
    string Sha256,
    DateTimeOffset LastModifiedUtc,
    int AttemptCount);

internal sealed class OutboxRepository
{
    private readonly string _connectionString = new SqliteConnectionStringBuilder { DataSource = AppPaths.Outbox }.ToString();

    public OutboxRepository()
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT NOT NULL,
                content BLOB NOT NULL,
                sha256 TEXT NOT NULL UNIQUE,
                last_modified_utc TEXT NOT NULL,
                created_utc TEXT NOT NULL,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                next_attempt_utc TEXT NOT NULL,
                sent_utc TEXT NULL,
                last_error TEXT NULL
            );
            CREATE INDEX IF NOT EXISTS snapshots_due_idx ON snapshots(sent_utc, next_attempt_utc);
            """;
        command.ExecuteNonQuery();
    }

    private SqliteConnection Open()
    {
        var connection = new SqliteConnection(_connectionString);
        connection.Open();
        return connection;
    }

    public bool Enqueue(string fileName, byte[] content, string hash, DateTimeOffset lastModifiedUtc)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT OR IGNORE INTO snapshots(file_name, content, sha256, last_modified_utc, created_utc, next_attempt_utc)
            VALUES($fileName, $content, $hash, $modified, $now, $now)
            """;
        command.Parameters.AddWithValue("$fileName", fileName);
        command.Parameters.AddWithValue("$content", content);
        command.Parameters.AddWithValue("$hash", hash);
        command.Parameters.AddWithValue("$modified", lastModifiedUtc.ToString("O"));
        command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
        return command.ExecuteNonQuery() > 0;
    }

    public PendingSnapshot? GetNextDue()
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, file_name, content, sha256, last_modified_utc, attempt_count
            FROM snapshots
            WHERE sent_utc IS NULL AND next_attempt_utc <= $now
            ORDER BY id
            LIMIT 1
            """;
        command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
        using var reader = command.ExecuteReader();
        return reader.Read()
            ? new PendingSnapshot(reader.GetInt64(0), reader.GetString(1), (byte[])reader[2], reader.GetString(3), DateTimeOffset.Parse(reader.GetString(4)), reader.GetInt32(5))
            : null;
    }

    public void MarkSent(long id)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "UPDATE snapshots SET sent_utc = $now, content = X'', last_error = NULL WHERE id = $id";
        command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
        command.Parameters.AddWithValue("$id", id);
        command.ExecuteNonQuery();
    }

    public void MarkFailed(long id, int previousAttempts, string error)
    {
        var delays = new[] { 2, 5, 10, 30 };
        var seconds = delays[Math.Min(previousAttempts, delays.Length - 1)];
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE snapshots SET attempt_count = attempt_count + 1, next_attempt_utc = $next, last_error = $error
            WHERE id = $id
            """;
        command.Parameters.AddWithValue("$next", DateTimeOffset.UtcNow.AddSeconds(seconds).ToString("O"));
        command.Parameters.AddWithValue("$error", error.Length > 1000 ? error[..1000] : error);
        command.Parameters.AddWithValue("$id", id);
        command.ExecuteNonQuery();
    }

    public int PendingCount()
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM snapshots WHERE sent_utc IS NULL";
        return Convert.ToInt32(command.ExecuteScalar());
    }
}

