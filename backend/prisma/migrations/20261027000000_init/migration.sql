-- CreateEnum
CREATE TYPE "SchoolLevel" AS ENUM ('PRIMARY', 'JUNIOR_SCHOOL', 'SECONDARY', 'TEACHER_TRAINING', 'SPECIAL_NEEDS');

-- CreateEnum
CREATE TYPE "OfficerRole" AS ENUM ('NATIONAL_ADMIN', 'REGIONAL_DIRECTOR', 'COUNTY_DIRECTOR', 'SUBCOUNTY_DIRECTOR', 'CSO', 'HEAD_OF_INSTITUTION');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'DEREGISTERED');

-- CreateEnum
CREATE TYPE "SensitiveKind" AS ENUM ('HEALTH', 'DISABILITY', 'DISCIPLINARY_NOTE');

-- CreateEnum
CREATE TYPE "PostingType" AS ENUM ('SUBSTANTIVE', 'ACTING');

-- CreateEnum
CREATE TYPE "PostingStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('APPOINTMENT_LETTER', 'TRANSFER_REQUEST', 'PROMOTION_FILE', 'APPRAISAL_RETURN', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('SUBMITTED', 'SUBCOUNTY_REVIEWED', 'COUNTY_APPROVED', 'NATIONAL_APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalTier" AS ENUM ('SUBCOUNTY', 'COUNTY', 'NATIONAL');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('PLANNED', 'APPROVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('OPEN', 'RESOLVED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "FlagSeverity" AS ENUM ('WARNING', 'BREACH');

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "County" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,

    CONSTRAINT "County_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubCounty" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countyId" TEXT NOT NULL,

    CONSTRAINT "SubCounty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "SchoolLevel" NOT NULL,
    "subCountyId" TEXT NOT NULL,
    "establishment" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Officer" (
    "id" TEXT NOT NULL,
    "staffNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "OfficerRole" NOT NULL,
    "regionId" TEXT,
    "countyId" TEXT,
    "subCountyId" TEXT,
    "schoolId" TEXT,
    "mfaSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Officer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsoAssignment" (
    "officerId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "CsoAssignment_pkey" PRIMARY KEY ("officerId","schoolId")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "tscNumber" TEXT NOT NULL,
    "nationalIdHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" TEXT,
    "registrationStatus" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "registeredAt" TIMESTAMP(3),
    "personnelFileComplete" BOOLEAN NOT NULL DEFAULT false,
    "portalPasswordHash" TEXT,
    "portalActivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SensitiveRecord" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "kind" "SensitiveKind" NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensitiveRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Posting" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "PostingType" NOT NULL DEFAULT 'SUBSTANTIVE',
    "designation" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "PostingStatus" NOT NULL DEFAULT 'ACTIVE',
    "endReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Posting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "filledAt" TIMESTAMP(3),
    "postingId" TEXT,

    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppraisalReturn" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "term" INTEGER NOT NULL,
    "complete" BOOLEAN NOT NULL DEFAULT true,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "AppraisalReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplinaryCase" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "caseType" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "DisciplinaryCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT,
    "fileName" TEXT,
    "storageKey" TEXT,
    "meta" JSONB,
    "status" "DocumentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedByOfficerId" TEXT,
    "submittedByTeacher" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "tier" "ApprovalTier" NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "officerId" TEXT NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldVisit" (
    "id" TEXT NOT NULL,
    "csoId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'PLANNED',
    "approvedById" TEXT,
    "report" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceFlag" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "severity" "FlagSeverity" NOT NULL,
    "status" "FlagStatus" NOT NULL DEFAULT 'OPEN',
    "label" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "schoolId" TEXT,
    "teacherId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "overriddenById" TEXT,
    "overrideReason" TEXT,

    CONSTRAINT "ComplianceFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CorrectionRequest" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "requested" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" JSONB,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE UNIQUE INDEX "County_code_key" ON "County"("code");

-- CreateIndex
CREATE INDEX "County_regionId_idx" ON "County"("regionId");

-- CreateIndex
CREATE INDEX "SubCounty_countyId_idx" ON "SubCounty"("countyId");

-- CreateIndex
CREATE UNIQUE INDEX "SubCounty_countyId_name_key" ON "SubCounty"("countyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "School_code_key" ON "School"("code");

-- CreateIndex
CREATE INDEX "School_subCountyId_idx" ON "School"("subCountyId");

-- CreateIndex
CREATE UNIQUE INDEX "Officer_staffNumber_key" ON "Officer"("staffNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Officer_email_key" ON "Officer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_tscNumber_key" ON "Teacher"("tscNumber");

-- CreateIndex
CREATE INDEX "SensitiveRecord_teacherId_idx" ON "SensitiveRecord"("teacherId");

-- CreateIndex
CREATE INDEX "Posting_teacherId_status_idx" ON "Posting"("teacherId", "status");

-- CreateIndex
CREATE INDEX "Posting_schoolId_status_idx" ON "Posting"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Vacancy_postingId_key" ON "Vacancy"("postingId");

-- CreateIndex
CREATE INDEX "Vacancy_schoolId_idx" ON "Vacancy"("schoolId");

-- CreateIndex
CREATE INDEX "AppraisalReturn_schoolId_year_term_idx" ON "AppraisalReturn"("schoolId", "year", "term");

-- CreateIndex
CREATE UNIQUE INDEX "AppraisalReturn_teacherId_year_term_key" ON "AppraisalReturn"("teacherId", "year", "term");

-- CreateIndex
CREATE INDEX "DisciplinaryCase_schoolId_idx" ON "DisciplinaryCase"("schoolId");

-- CreateIndex
CREATE INDEX "Document_schoolId_status_idx" ON "Document"("schoolId", "status");

-- CreateIndex
CREATE INDEX "Document_teacherId_idx" ON "Document"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_documentId_tier_key" ON "Approval"("documentId", "tier");

-- CreateIndex
CREATE INDEX "FieldVisit_schoolId_idx" ON "FieldVisit"("schoolId");

-- CreateIndex
CREATE INDEX "FieldVisit_csoId_idx" ON "FieldVisit"("csoId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceFlag_dedupeKey_key" ON "ComplianceFlag"("dedupeKey");

-- CreateIndex
CREATE INDEX "ComplianceFlag_schoolId_status_idx" ON "ComplianceFlag"("schoolId", "status");

-- CreateIndex
CREATE INDEX "ComplianceFlag_rule_status_idx" ON "ComplianceFlag"("rule", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_hash_key" ON "AuditEvent"("hash");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- AddForeignKey
ALTER TABLE "County" ADD CONSTRAINT "County_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubCounty" ADD CONSTRAINT "SubCounty_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "County"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_subCountyId_fkey" FOREIGN KEY ("subCountyId") REFERENCES "SubCounty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Officer" ADD CONSTRAINT "Officer_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Officer" ADD CONSTRAINT "Officer_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "County"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Officer" ADD CONSTRAINT "Officer_subCountyId_fkey" FOREIGN KEY ("subCountyId") REFERENCES "SubCounty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Officer" ADD CONSTRAINT "Officer_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsoAssignment" ADD CONSTRAINT "CsoAssignment_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "Officer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsoAssignment" ADD CONSTRAINT "CsoAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensitiveRecord" ADD CONSTRAINT "SensitiveRecord_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Officer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppraisalReturn" ADD CONSTRAINT "AppraisalReturn_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppraisalReturn" ADD CONSTRAINT "AppraisalReturn_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryCase" ADD CONSTRAINT "DisciplinaryCase_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_submittedByOfficerId_fkey" FOREIGN KEY ("submittedByOfficerId") REFERENCES "Officer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "Officer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldVisit" ADD CONSTRAINT "FieldVisit_csoId_fkey" FOREIGN KEY ("csoId") REFERENCES "Officer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldVisit" ADD CONSTRAINT "FieldVisit_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldVisit" ADD CONSTRAINT "FieldVisit_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Officer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceFlag" ADD CONSTRAINT "ComplianceFlag_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceFlag" ADD CONSTRAINT "ComplianceFlag_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "Officer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
