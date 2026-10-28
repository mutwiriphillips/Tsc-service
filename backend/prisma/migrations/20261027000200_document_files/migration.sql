-- CreateTable
CREATE TABLE "DocumentFile" (
    "documentId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentFile_pkey" PRIMARY KEY ("documentId")
);

-- AddForeignKey
ALTER TABLE "DocumentFile" ADD CONSTRAINT "DocumentFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
