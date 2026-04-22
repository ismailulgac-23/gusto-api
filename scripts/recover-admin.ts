import { PrismaClient, UserType } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "gusto@app.net";
const ADMIN_PASSWORD = "GustoApp2341!";
const ADMIN_NAME = "Gusto Admin";
const ADMIN_PHONE = "+905550000001";

async function main() {
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const existingAdmin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (existingAdmin) {
    const updatedAdmin = await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        name: ADMIN_NAME,
        phoneNumber: existingAdmin.phoneNumber || ADMIN_PHONE,
        password: hashedPassword,
        userType: UserType.PROVIDER,
        isAdmin: true,
        isActive: true,
      },
    });

    console.log("✅ Admin hesabı güncellendi");
    console.log(`ID: ${updatedAdmin.id}`);
    console.log(`Email/Username: ${ADMIN_EMAIL}`);
    return;
  }

  const adminWithPhone = await prisma.user.findUnique({
    where: { phoneNumber: ADMIN_PHONE },
  });

  if (adminWithPhone) {
    const updatedAdmin = await prisma.user.update({
      where: { id: adminWithPhone.id },
      data: {
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        password: hashedPassword,
        userType: UserType.PROVIDER,
        isAdmin: true,
        isActive: true,
      },
    });

    console.log("✅ Telefon üzerinden bulunan kullanıcı admin olarak güncellendi");
    console.log(`ID: ${updatedAdmin.id}`);
    console.log(`Email/Username: ${ADMIN_EMAIL}`);
    return;
  }

  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      password: hashedPassword,
      name: ADMIN_NAME,
      phoneNumber: ADMIN_PHONE,
      userType: UserType.PROVIDER,
      isAdmin: true,
      isActive: true,
      balance: 200,
    },
  });

  console.log("✅ Admin hesabı oluşturuldu");
  console.log(`ID: ${admin.id}`);
  console.log(`Email/Username: ${ADMIN_EMAIL}`);
}

main()
  .catch((error) => {
    console.error("❌ Admin recovery hatası:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
