-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "episode" TEXT NOT NULL,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "city" TEXT,
    "tags" JSONB NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "contributor" JSONB NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
