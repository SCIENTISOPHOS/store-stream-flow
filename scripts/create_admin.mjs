import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);

const email = 'anjoueneyaarafat@gmail.com';
const password = 'Arafat2026!Admin';

// list users
const { data: list, error: le } = await sb.auth.admin.listUsers({ perPage: 200 });
if (le) { console.error(le); process.exit(1); }
let user = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

if (!user) {
  const { data, error } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { display_name: 'Arafat Anjoun', }
  });
  if (error) { console.error('create:', error); process.exit(1); }
  user = data.user;
  console.log('Created user', user.id);
} else {
  const { error } = await sb.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (error) { console.error('update:', error); process.exit(1); }
  console.log('Updated existing user', user.id);
}

// ensure admin role
await sb.from('user_roles').delete().eq('user_id', user.id);
const { error: re } = await sb.from('user_roles').insert({ user_id: user.id, role: 'admin' });
if (re) { console.error('role:', re); process.exit(1); }
console.log('Admin role set. Email:', email, 'Password:', password);
