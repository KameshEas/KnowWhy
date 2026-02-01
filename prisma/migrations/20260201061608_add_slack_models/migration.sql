-- CreateTable
CREATE TABLE "public"."slack_workspaces" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workspaceName" TEXT NOT NULL,
    "botUserId" TEXT,
    "botAccessToken" TEXT NOT NULL,
    "installedBy" TEXT NOT NULL,
    "userId" TEXT,
    "installUrl" TEXT NOT NULL,
    "scopes" TEXT[],
    "lastSyncedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."slack_installations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botToken" TEXT NOT NULL,
    "userToken" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."slack_sync_status" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "lastMessageTimestamp" TEXT,
    "totalChannels" INTEGER NOT NULL DEFAULT 0,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorMessage" TEXT,
    "isSyncing" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_sync_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slack_workspaces_workspaceId_key" ON "public"."slack_workspaces"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "slack_installations_workspaceId_key" ON "public"."slack_installations"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "slack_sync_status_workspaceId_key" ON "public"."slack_sync_status"("workspaceId");

-- AddForeignKey
ALTER TABLE "public"."slack_workspaces" ADD CONSTRAINT "slack_workspaces_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."slack_installations" ADD CONSTRAINT "slack_installations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."slack_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."slack_sync_status" ADD CONSTRAINT "slack_sync_status_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."slack_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
