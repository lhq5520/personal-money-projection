/*
  Warnings:

  - You are about to drop the column `allowSeparateBonusTax` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `childrenCount` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `continuingEducation` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `elderlyCare` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `elderlyShareAmount` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `hfAnnualInterestRate` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `hfInvestWithdrawal` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `hfMonthlyWithdrawal` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `housingType` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `infantCount` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `mealAllowance` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `ovHfBaseMax` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `ovHfBaseMin` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `ovHfRateEmployer` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `ovHfRateSelf` on the `scenario` table. All the data in the column will be lost.
  - You are about to drop the column `rentTier` on the `scenario` table. All the data in the column will be lost.
  - Added the required column `planAnnualInterestRate` to the `scenario` table without a default value. This is not possible if the table is not empty.
  - Added the required column `planMonthlyWithdrawal` to the `scenario` table without a default value. This is not possible if the table is not empty.
  - Added the required column `taxFreeAllowance` to the `scenario` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "scenario" DROP COLUMN "allowSeparateBonusTax",
DROP COLUMN "childrenCount",
DROP COLUMN "city",
DROP COLUMN "continuingEducation",
DROP COLUMN "elderlyCare",
DROP COLUMN "elderlyShareAmount",
DROP COLUMN "hfAnnualInterestRate",
DROP COLUMN "hfInvestWithdrawal",
DROP COLUMN "hfMonthlyWithdrawal",
DROP COLUMN "housingType",
DROP COLUMN "infantCount",
DROP COLUMN "mealAllowance",
DROP COLUMN "ovHfBaseMax",
DROP COLUMN "ovHfBaseMin",
DROP COLUMN "ovHfRateEmployer",
DROP COLUMN "ovHfRateSelf",
DROP COLUMN "rentTier",
ADD COLUMN     "caEmployerMatchRate" DECIMAL(8,6) NOT NULL DEFAULT 0.03,
ADD COLUMN     "caFilingStatus" TEXT NOT NULL DEFAULT 'single',
ADD COLUMN     "caOtherCreditBase" DECIMAL(16,2) NOT NULL DEFAULT 0,
ADD COLUMN     "caRrspRate" DECIMAL(8,6) NOT NULL DEFAULT 0.06,
ADD COLUMN     "cnAllowSeparateBonusTax" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cnChildrenCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cnContinuingEducation" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "cnElderlyCare" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "cnElderlyShareAmount" DECIMAL(16,2),
ADD COLUMN     "cnHousingType" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "cnInfantCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cnRentTier" TEXT,
ADD COLUMN     "jurisdiction" TEXT NOT NULL DEFAULT 'shanghai',
ADD COLUMN     "ovPlanBaseMax" DECIMAL(16,2),
ADD COLUMN     "ovPlanBaseMin" DECIMAL(16,2),
ADD COLUMN     "ovPlanRateEmployer" DECIMAL(8,6),
ADD COLUMN     "ovPlanRateSelf" DECIMAL(8,6),
ADD COLUMN     "planAnnualInterestRate" DECIMAL(8,6) NOT NULL,
ADD COLUMN     "planInvestWithdrawal" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "planMonthlyWithdrawal" DECIMAL(16,2) NOT NULL,
ADD COLUMN     "taxFreeAllowance" DECIMAL(16,2) NOT NULL,
ADD COLUMN     "usEmployerMatchRate" DECIMAL(8,6) NOT NULL DEFAULT 0.04,
ADD COLUMN     "usFilingStatus" TEXT NOT NULL DEFAULT 'single',
ADD COLUMN     "usItemizedDeduction" DECIMAL(16,2) NOT NULL DEFAULT 0,
ADD COLUMN     "usPretaxRetirementRate" DECIMAL(8,6) NOT NULL DEFAULT 0.06,
ADD COLUMN     "usQualifyingChildren" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "scenario_userId_region_idx" ON "scenario"("userId", "region");
