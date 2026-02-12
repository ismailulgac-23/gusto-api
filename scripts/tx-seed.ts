import { PrismaClient, UserType, TransactionType, TransactionStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Starting transaction seeding...");

    const users = await prisma.user.findMany();

    if (users.length === 0) {
        console.log("No users found to seed transactions for.");
        return;
    }

    for (const user of users) {
        console.log(`Seeding transactions for user: ${user.name} (${user.userType})`);

        // Each user gets some initial deposit
        const transactions = [
            {
                userId: user.id,
                amount: 1500.0,
                type: TransactionType.DEPOSIT,
                status: TransactionStatus.COMPLETED,
                description: "Başlangıç bakiyesi",
            },
            {
                userId: user.id,
                amount: -250.0,
                type: TransactionType.WITHDRAWAL,
                status: TransactionStatus.COMPLETED,
                description: "Hesaptan çekim",
            },
            {
                userId: user.id,
                amount: user.userType === UserType.PROVIDER ? 500.0 : -500.0,
                type: user.userType === UserType.PROVIDER ? TransactionType.PAYMENT : TransactionType.PAYMENT,
                status: TransactionStatus.COMPLETED,
                description: user.userType === UserType.PROVIDER ? "Hizmet bedeli tahsilatı" : "Hizmet ödemesi",
            }
        ];

        for (const tx of transactions) {
            await prisma.transaction.create({
                data: tx
            });
        }

        // Update user balance
        const totalBalance = transactions.reduce((acc, curr) => acc + curr.amount, 0);
        await prisma.user.update({
            where: { id: user.id },
            data: { balance: totalBalance }
        });
    }

    console.log("Transaction seeding completed successfully!");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
