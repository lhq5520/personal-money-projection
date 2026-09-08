-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "region" TEXT NOT NULL DEFAULT 'CN',
    "city" TEXT NOT NULL DEFAULT 'shanghai',
    "allowSeparateBonusTax" BOOLEAN NOT NULL DEFAULT true,
    "monthlySalary" DECIMAL(16,2) NOT NULL,
    "salaryMonths" DECIMAL(5,2) NOT NULL,
    "mealAllowance" DECIMAL(16,2) NOT NULL,
    "salaryGrowthRate" DECIMAL(8,6) NOT NULL,
    "childrenCount" INTEGER NOT NULL DEFAULT 0,
    "infantCount" INTEGER NOT NULL DEFAULT 0,
    "continuingEducation" TEXT NOT NULL DEFAULT 'none',
    "housingType" TEXT NOT NULL DEFAULT 'none',
    "rentTier" TEXT,
    "elderlyCare" TEXT NOT NULL DEFAULT 'none',
    "elderlyShareAmount" DECIMAL(16,2),
    "monthlySpend" DECIMAL(16,2) NOT NULL,
    "spendGrowthRate" DECIMAL(8,6) NOT NULL,
    "hfMonthlyWithdrawal" DECIMAL(16,2) NOT NULL,
    "hfAnnualInterestRate" DECIMAL(8,6) NOT NULL,
    "hfInvestWithdrawal" BOOLEAN NOT NULL DEFAULT true,
    "initialCapital" DECIMAL(16,2) NOT NULL,
    "years" INTEGER NOT NULL,
    "expectedAnnualReturn" DECIMAL(8,6) NOT NULL,
    "annualVolatility" DECIMAL(8,6) NOT NULL,
    "feeDragAnnual" DECIMAL(8,6) NOT NULL,
    "dividendYield" DECIMAL(8,6) NOT NULL,
    "dividendWithholdingTax" DECIMAL(8,6) NOT NULL,
    "investRatio" DECIMAL(8,6) NOT NULL,
    "inflationRate" DECIMAL(8,6) NOT NULL,
    "ovSocialBaseMin" DECIMAL(16,2),
    "ovSocialBaseMax" DECIMAL(16,2),
    "ovSocialRateSelf" DECIMAL(8,6),
    "ovHfBaseMin" DECIMAL(16,2),
    "ovHfBaseMax" DECIMAL(16,2),
    "ovHfRateSelf" DECIMAL(8,6),
    "ovHfRateEmployer" DECIMAL(8,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_step" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "atYear" INTEGER NOT NULL,
    "newMonthlySalary" DECIMAL(16,2) NOT NULL,

    CONSTRAINT "salary_step_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "scenario_userId_updatedAt_idx" ON "scenario"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "scenario_userId_name_key" ON "scenario"("userId", "name");

-- CreateIndex
CREATE INDEX "salary_step_scenarioId_idx" ON "salary_step"("scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "salary_step_scenarioId_atYear_key" ON "salary_step"("scenarioId", "atYear");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario" ADD CONSTRAINT "scenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_step" ADD CONSTRAINT "salary_step_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
