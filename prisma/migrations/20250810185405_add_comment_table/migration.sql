-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "episode" TEXT NOT NULL,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "city" TEXT,
    "tags" JSONB NOT NULL DEFAULT [],
    "imageUrl" TEXT NOT NULL,
    "contributor" JSONB NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Entry" ("city", "contributor", "createdAt", "episode", "id", "imageUrl", "likes", "tags", "title", "yearFrom", "yearTo") SELECT "city", "contributor", "createdAt", "episode", "id", "imageUrl", "likes", "tags", "title", "yearFrom", "yearTo" FROM "Entry";
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Comment_entryId_idx" ON "Comment"("entryId");
