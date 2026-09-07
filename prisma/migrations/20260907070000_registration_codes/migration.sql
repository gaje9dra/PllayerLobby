-- CreateTable
CREATE TABLE "RegistrationCode" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "codeEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RegistrationCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationCode_registrationId_key" ON "RegistrationCode"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationCode_codeHash_key" ON "RegistrationCode"("codeHash");

-- CreateIndex
CREATE INDEX "RegistrationCode_revokedAt_idx" ON "RegistrationCode"("revokedAt");

-- AddForeignKey
ALTER TABLE "RegistrationCode" ADD CONSTRAINT "RegistrationCode_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
