import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOT_DE_PASSE_MIN, estSessionPerdue, lireLienAuth, traduireErreurAuth, validerNouveauMotDePasse } from '../src/core/recuperation.ts';

test('un lien de récupération valide : jeton ET type', () => {
  assert.deepEqual(lireLienAuth('#access_token=abc.def.ghi&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery'), { type: 'recuperation' });
  // Sans le « # » : l'appelant peut passer location.hash tel quel ou nettoyé.
  assert.deepEqual(lireLienAuth('access_token=abc&type=recovery'), { type: 'recuperation' });
});

test('une confirmation d’inscription porte un jeton aussi : elle n’ouvre pas l’écran du mot de passe', () => {
  assert.equal(lireLienAuth('#access_token=abc.def.ghi&expires_in=3600&refresh_token=r&token_type=bearer&type=signup'), null);
  assert.equal(lireLienAuth('#access_token=abc&type=magiclink'), null);
});

test('« type=recovery » sans jeton n’est pas un lien valide', () => {
  assert.equal(lireLienAuth('#type=recovery'), null);
});

test('un lien périmé : l’erreur et son code', () => {
  const l = lireLienAuth('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  assert.deepEqual(l, { type: 'erreur', code: 'otp_expired' });
  // Sans code précis, l'erreur reste une erreur.
  assert.deepEqual(lireLienAuth('#error=access_denied'), { type: 'erreur', code: 'access_denied' });
  assert.equal(lireLienAuth('#error_description=Quelque+chose')?.type, 'erreur');
});

test('ce qui n’est pas un lien d’authentification est laissé tranquille', () => {
  assert.equal(lireLienAuth(''), null);
  assert.equal(lireLienAuth('#'), null);
  assert.equal(lireLienAuth('#ami=ABCD2345'), null, 'une invitation à un ami');
  assert.equal(lireLienAuth('#section-2'), null);
});

test('nouveau mot de passe : longueur minimale, en caractères', () => {
  assert.match(validerNouveauMotDePasse('1234567', '1234567') ?? '', /au moins 8/);
  assert.equal(validerNouveauMotDePasse('12345678', '12345678'), null);
  assert.equal(MOT_DE_PASSE_MIN, 8);
  // Huit émojis sont huit caractères, même si JavaScript en compte seize.
  assert.equal(validerNouveauMotDePasse('😀'.repeat(8), '😀'.repeat(8)), null);
  assert.ok(validerNouveauMotDePasse('😀'.repeat(7), '😀'.repeat(7)));
});

test('nouveau mot de passe : 72 octets au plus, pas 72 caractères', () => {
  const limite = 'a'.repeat(72);
  assert.equal(validerNouveauMotDePasse(limite, limite), null);
  assert.match(validerNouveauMotDePasse(limite + 'a', limite + 'a') ?? '', /trop long/);
  // 40 « é » ne font que 40 caractères, mais 80 octets : la base les refuserait.
  assert.match(validerNouveauMotDePasse('é'.repeat(40), 'é'.repeat(40)) ?? '', /trop long/);
  assert.equal(validerNouveauMotDePasse('é'.repeat(36), 'é'.repeat(36)), null);
});

test('nouveau mot de passe : la confirmation doit être identique, espace de fin compris', () => {
  assert.match(validerNouveauMotDePasse('motdepasse1', 'motdepasse2') ?? '', /pas identiques/);
  assert.match(validerNouveauMotDePasse('motdepasse1', 'motdepasse1 ') ?? '', /pas identiques/);
  assert.match(validerNouveauMotDePasse('motdepasse1', '') ?? '', /pas identiques/);
});

test('nouveau mot de passe : pas fait que d’espaces, mais les espaces sont permis', () => {
  assert.match(validerNouveauMotDePasse('        ', '        ') ?? '', /espaces/);
  assert.equal(validerNouveauMotDePasse('une phrase de passe', 'une phrase de passe'), null);
});

test('messages : l’attente entre deux envois dit combien de secondes', () => {
  assert.equal(traduireErreurAuth('For security purposes, you can only request this after 52 seconds.', 'over_email_send_rate_limit'), 'Un lien vient d’être demandé : réessaie dans 52 s.');
  assert.equal(traduireErreurAuth('For security purposes, you can only request this after 1 second.'), 'Un lien vient d’être demandé : réessaie dans 1 s.');
});

test('messages : la limite horaire du projet n’est pas l’attente entre deux envois', () => {
  const heure = traduireErreurAuth('email rate limit exceeded', 'over_email_send_rate_limit');
  assert.match(heure, /une heure/);
  assert.doesNotMatch(heure, / s\./);
  assert.match(traduireErreurAuth('Too many requests'), /une heure/);
});

test('messages : adresse refusée, adresse invalide', () => {
  assert.match(traduireErreurAuth('Email address "x@y.fr" cannot be used as it is not authorized', 'email_address_not_authorized'), /Impossible d’envoyer/);
  assert.match(traduireErreurAuth('Unable to validate email address: invalid format'), /pas valide/);
});

test('messages : le nouveau mot de passe', () => {
  assert.match(traduireErreurAuth('New password should be different from the old password.', 'same_password'), /déjà ton mot de passe/);
  assert.equal(traduireErreurAuth('Password should be at least 10 characters.'), 'Mot de passe trop court (10 caractères minimum).');
  assert.match(traduireErreurAuth('Password is known to be weak and easy to guess, please choose a different one.', 'weak_password'), /trop courant/);
  assert.match(traduireErreurAuth('Password should contain at least one character of each: abc, ABC, 123', 'weak_password'), /lettres, chiffres et symboles/);
});

test('messages : connexion et inscription gardent leurs traductions', () => {
  assert.equal(traduireErreurAuth('Invalid login credentials'), 'Email ou mot de passe incorrect.');
  assert.match(traduireErreurAuth('Email not confirmed'), /pas encore confirmée/);
  assert.match(traduireErreurAuth('User already registered'), /existe déjà/);
});

test('messages : un message inconnu reste lisible tel quel', () => {
  assert.equal(traduireErreurAuth('Something unexpected'), 'Something unexpected');
});

test('la connexion ouverte par le lien a disparu', () => {
  assert.ok(estSessionPerdue('Auth session missing!'));
  assert.ok(estSessionPerdue('whatever', 'session_not_found'));
  assert.ok(!estSessionPerdue('Invalid login credentials'));
  assert.match(traduireErreurAuth('Auth session missing!'), /n’est plus valable/);
});
