"use client";
import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";

const MESSAGES = [
  "やあ！Discordでログインすると\n思い出を投稿できるよ！",
  "平成の思い出、一緒に\n集めてみない？",
  "ログインして\n懐かしい記憶を共有しよう！",
  "Discordアカウントで\nすぐに参加できるよ！",
  "みんなの思い出、\n待ってるよ〜！",
];

export default function DiscordAssistant() {
  const { data: session, status } = useSession();
  const [dismissed, setDismissed] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const [isWaving, setIsWaving] = useState(false);

  // ログイン済み or ローディング中 or 閉じた場合は非表示
  useEffect(() => {
    // セッションストレージで閉じた状態を保持
    const wasDismissed = sessionStorage.getItem("discord-assistant-dismissed");
    if (wasDismissed === "true") {
      setDismissed(true);
    }
  }, []);

  // メッセージを定期的に変更
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
      setIsWaving(true);
      setTimeout(() => setIsWaving(false), 500);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("discord-assistant-dismissed", "true");
  };

  const handleLogin = () => {
    signIn("discord");
  };

  // ログイン済み、ローディング中、閉じた場合は表示しない
  if (status === "loading" || session || dismissed) {
    return null;
  }

  return (
    <div className="discord-assistant">
      {/* 吹き出し */}
      <div className="assistant-bubble animate-window">
        <button
          className="bubble-close"
          onClick={handleDismiss}
          aria-label="閉じる"
        >
          ×
        </button>
        <p className="bubble-text">{MESSAGES[messageIndex]}</p>
        <button className="bubble-login-btn" onClick={handleLogin}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ marginRight: "6px" }}
          >
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
          ログイン
        </button>
      </div>

      {/* Discordキャラクター */}
      <div
        className={`assistant-character ${isWaving ? "wave" : ""}`}
        onClick={handleLogin}
        title="クリックでログイン！"
      >
        <div className="character-body">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="#5865F2"
          >
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
