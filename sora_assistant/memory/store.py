from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sora_assistant.models import Memory, Message, SessionSummary, new_id, utc_now


class SQLiteAssistantStore:
    def __init__(self, database_path: str | Path) -> None:
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                PRAGMA journal_mode = WAL;

                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY,
                    text TEXT NOT NULL,
                    tags TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
                CREATE INDEX IF NOT EXISTS idx_memories_text ON memories(text);
                """
            )

    def create_session(self, title: str = "New conversation") -> SessionSummary:
        session_id = new_id()
        now = utc_now()
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (session_id, title, now, now),
            )
        return SessionSummary(id=session_id, title=title, created_at=now, updated_at=now, message_count=0)

    def ensure_session(self, session_id: str | None = None) -> SessionSummary:
        if not session_id:
            return self.create_session()
        session = self.get_session(session_id)
        if session:
            return session
        now = utc_now()
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (session_id, "New conversation", now, now),
            )
        return SessionSummary(id=session_id, title="New conversation", created_at=now, updated_at=now, message_count=0)

    def get_session(self, session_id: str) -> SessionSummary | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT sessions.*, COUNT(messages.id) AS message_count
                FROM sessions
                LEFT JOIN messages ON messages.session_id = sessions.id
                WHERE sessions.id = ?
                GROUP BY sessions.id
                """,
                (session_id,),
            ).fetchone()
        if not row:
            return None
        return SessionSummary(
            id=row["id"],
            title=row["title"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            message_count=row["message_count"],
        )

    def list_sessions(self) -> list[SessionSummary]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT sessions.*, COUNT(messages.id) AS message_count
                FROM sessions
                LEFT JOIN messages ON messages.session_id = sessions.id
                GROUP BY sessions.id
                ORDER BY sessions.updated_at DESC
                """
            ).fetchall()
        return [
            SessionSummary(
                id=row["id"],
                title=row["title"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                message_count=row["message_count"],
            )
            for row in rows
        ]

    def add_message(self, session_id: str, message: Message) -> None:
        now = utc_now()
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                (session_id, message.role, message.content, message.created_at),
            )
            connection.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id))

    def list_messages(self, session_id: str, limit: int = 30) -> list[Message]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT role, content, created_at
                FROM messages
                WHERE session_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (session_id, limit),
            ).fetchall()
        messages = [Message(role=row["role"], content=row["content"], created_at=row["created_at"]) for row in rows]
        messages.reverse()
        return messages

    def save_memory(self, text: str, tags: list[str] | None = None) -> Memory:
        memory_id = new_id()
        now = utc_now()
        clean_tags = [tag.strip().lower() for tag in (tags or []) if tag.strip()]
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO memories (id, text, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (memory_id, text.strip(), json.dumps(clean_tags), now, now),
            )
        return Memory(id=memory_id, text=text.strip(), tags=clean_tags, created_at=now, updated_at=now)

    def search_memories(self, query: str = "", limit: int = 20) -> list[Memory]:
        if query.strip():
            pattern = f"%{query.strip()}%"
            sql = "SELECT * FROM memories WHERE text LIKE ? OR tags LIKE ? ORDER BY updated_at DESC LIMIT ?"
            params: tuple[object, ...] = (pattern, pattern, limit)
        else:
            sql = "SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?"
            params = (limit,)
        with self._connect() as connection:
            rows = connection.execute(sql, params).fetchall()
        return [self._memory_from_row(row) for row in rows]

    def delete_memory(self, memory_id: str) -> bool:
        with self._connect() as connection:
            cursor = connection.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
        return cursor.rowcount > 0

    @staticmethod
    def _memory_from_row(row: sqlite3.Row) -> Memory:
        return Memory(
            id=row["id"],
            text=row["text"],
            tags=json.loads(row["tags"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
