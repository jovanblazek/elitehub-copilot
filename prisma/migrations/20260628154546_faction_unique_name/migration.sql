/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `Faction` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Faction_name_key" ON "Faction"("name");
