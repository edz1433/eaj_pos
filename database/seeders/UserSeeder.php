<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * Roles:
     *   super_admin   — no branch, bypasses all access checks, full system
     *   administrator — full branch admin (products, users, orders, reports)
     *   manager       — approves expenses & petty cash, verifies cash counts
     *   cashier       — POS only: sales, cash session, cash count, petty cash requests
     */
    public function run(): void
    {
        $cmc  = Branch::where('code', 'CMC')->first();
        $can  = Branch::where('code', 'CAN')->first();
        $abc1 = Branch::where('code', 'ABC1')->first();
        $xyz1 = Branch::where('code', 'XYZ1')->first();

        $users = [

            // ── Super Admin ────────────────────────────────────────
            [
                'fname'     => 'System',
                'lname'     => 'Administrator',
                'username'  => 'superadmin',
                'password'  => Hash::make('superadmin123'),
                'role'      => User::ROLE_SUPER_ADMIN,
                'branch_id' => null,
                'access'    => [],
            ],

            // ── Administrators ─────────────────────────────────────
            [
                'fname'     => 'Admin',
                'lname'     => 'COOP Main',
                'username'  => 'admin.coop.main',
                'password'  => Hash::make('admin123'),
                'role'      => User::ROLE_ADMINISTRATOR,
                'branch_id' => $cmc?->id,
                'access'    => [],
            ],
            [
                'fname'     => 'Admin',
                'lname'     => 'COOP Annex',
                'username'  => 'admin.coop.annex',
                'password'  => Hash::make('admin123'),
                'role'      => User::ROLE_ADMINISTRATOR,
                'branch_id' => $can?->id,
                'access'    => [],
            ],
            [
                'fname'     => 'Admin',
                'lname'     => 'ABC Store',
                'username'  => 'admin.abc',
                'password'  => Hash::make('admin123'),
                'role'      => User::ROLE_ADMINISTRATOR,
                'branch_id' => $abc1?->id,
                'access'    => [],
            ],
            [
                'fname'     => 'Admin',
                'lname'     => 'XYZ Warehouse',
                'username'  => 'admin.xyz',
                'password'  => Hash::make('admin123'),
                'role'      => User::ROLE_ADMINISTRATOR,
                'branch_id' => $xyz1?->id,
                'access'    => [],
            ],

            // ── Managers ───────────────────────────────────────────
            [
                'fname'     => 'Ana',
                'lname'     => 'Rivera',
                'username'  => 'ana.manager',
                'password'  => Hash::make('manager123'),
                'role'      => User::ROLE_MANAGER,
                'branch_id' => $cmc?->id,
                'access'    => [],
            ],
            [
                'fname'     => 'Ben',
                'lname'     => 'Torres',
                'username'  => 'ben.manager',
                'password'  => Hash::make('manager123'),
                'role'      => User::ROLE_MANAGER,
                'branch_id' => $can?->id,
                'access'    => [],
            ],
            [
                'fname'     => 'Maria',
                'lname'     => 'Santos',
                'username'  => 'maria.manager',
                'password'  => Hash::make('manager123'),
                'role'      => User::ROLE_MANAGER,
                'branch_id' => $abc1?->id,
                'access'    => [],
            ],
            [
                'fname'     => 'Pedro',
                'lname'     => 'Reyes',
                'username'  => 'pedro.manager',
                'password'  => Hash::make('manager123'),
                'role'      => User::ROLE_MANAGER,
                'branch_id' => $xyz1?->id,
                'access'    => [],
            ],

            // ── Cashiers ───────────────────────────────────────────
            // CMC has 2 cashiers — busy dine-in cafe
            [
                'fname'     => 'Carlo',
                'lname'     => 'Mendoza',
                'username'  => 'carlo.cashier',
                'password'  => Hash::make('cashier123'),
                'role'      => User::ROLE_CASHIER,
                'branch_id' => $cmc?->id,
                'access'    => [],
            ],
            [
                'fname'     => 'Diana',
                'lname'     => 'Cruz',
                'username'  => 'diana.cashier',
                'password'  => Hash::make('cashier123'),
                'role'      => User::ROLE_CASHIER,
                'branch_id' => $cmc?->id,
                'access'    => [],
            ],
            [
                'fname'     => 'Ella',
                'lname'     => 'Bautista',
                'username'  => 'ella.cashier',
                'password'  => Hash::make('cashier123'),
                'role'      => User::ROLE_CASHIER,
                'branch_id' => $can?->id,
                'access'    => [],
            ],
            [
                'fname'     => 'Frank',
                'lname'     => 'Lim',
                'username'  => 'frank.cashier',
                'password'  => Hash::make('cashier123'),
                'role'      => User::ROLE_CASHIER,
                'branch_id' => $abc1?->id,
                'access'    => [],
            ],
            [
                'fname'     => 'Grace',
                'lname'     => 'Tan',
                'username'  => 'grace.cashier',
                'password'  => Hash::make('cashier123'),
                'role'      => User::ROLE_CASHIER,
                'branch_id' => $xyz1?->id,
                'access'    => [],
            ],
        ];

        foreach ($users as $data) {
            User::firstOrCreate(['username' => $data['username']], $data);
        }

        $this->command->info('✓ Users seeded (' . count($users) . ')');
    }
}
