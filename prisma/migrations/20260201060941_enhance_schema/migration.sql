/*
  Warnings:

  - A unique constraint covering the columns `[source,externalId]` on the table `conversations` will be added. If there are existing duplicate values, this will fail.
  - Made the column `source` on table `conversations` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."conversations" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "slackChannelId" TEXT,
ADD COLUMN     "slackMessageId" TEXT,
ADD COLUMN     "slackThreadId" TEXT,
ALTER COLUMN "source" SET NOT NULL;

-- AlterTable
ALTER TABLE "public"."decision_briefs" ADD COLUMN     "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "public"."decision_candidates" ADD COLUMN     "agentVersion" TEXT NOT NULL DEFAULT 'v1';

-- CreateIndex
CREATE UNIQUE INDEX "conversations_source_externalId_key" ON "public"."conversations"("source", "externalId");
