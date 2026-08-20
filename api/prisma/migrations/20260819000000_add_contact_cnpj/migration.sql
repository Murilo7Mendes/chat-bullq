-- CreateTable
CREATE TABLE "contact_cnpjs" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "auto_notify" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_cnpjs_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex (evita duplicar o mesmo CNPJ no mesmo contato)
CREATE UNIQUE INDEX "contact_cnpjs_contact_id_cnpj_key" ON "contact_cnpjs"("contact_id", "cnpj");

-- CreateIndex (lookup eficiente: dado um CNPJ, achar todos os contatos)
CREATE INDEX "idx_contact_cnpj_lookup" ON "contact_cnpjs"("cnpj");

-- AddForeignKey
ALTER TABLE "contact_cnpjs" ADD CONSTRAINT "contact_cnpjs_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
