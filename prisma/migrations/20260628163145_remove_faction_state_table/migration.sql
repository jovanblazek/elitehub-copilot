/*
  Warnings:

  - You are about to drop the `FactionState` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "FactionState" DROP CONSTRAINT "FactionState_factionId_fkey";

-- DropTable
DROP TABLE "FactionState";

-- DropEnum
DROP TYPE "StateType";
