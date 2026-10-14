ALTER TABLE "GiftVoucher"
ADD COLUMN "discountCode" TEXT,
ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "paymentAmount" INTEGER;

UPDATE "GiftVoucher" SET "paymentAmount" = "amount" WHERE "paymentAmount" IS NULL;
