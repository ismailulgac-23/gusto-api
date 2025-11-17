import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdmin() {
  const email = process.argv[2] || 'admin@admin.com';
  const password = process.argv[3] || 'admin123';
  const name = process.argv[4] || 'Admin User';

  try {
    // Check if admin already exists
    const existingAdmin = await prisma.user.findUnique({
      where: { email },
    });

    if (existingAdmin) {
      console.log('⚠️  Admin user already exists with this email:', email);
      console.log('Updating password...');
      
      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { email },
        data: {
          password: hashedPassword,
          isAdmin: true,
          isActive: true,
        },
      });
      
      console.log('✅ Admin user updated successfully!');
      console.log('Email:', email);
      console.log('Password:', password);
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phoneNumber: `+90${Math.floor(Math.random() * 1000000000)}`, // Random phone number
        userType: 'PROVIDER',
        isAdmin: true,
        isActive: true,
      },
    });

    console.log('✅ Admin user created successfully!');
    console.log('ID:', admin.id);
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Name:', name);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();

