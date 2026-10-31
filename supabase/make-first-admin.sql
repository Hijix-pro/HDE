-- Remplacez l'adresse entre apostrophes par l'email du premier administrateur.
update public.profiles as profile
set role = 'admin'
from auth.users as auth_user
where profile.id = auth_user.id
  and lower(auth_user.email) = lower('VOTRE_EMAIL_ICI');
