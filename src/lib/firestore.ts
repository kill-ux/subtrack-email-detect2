import { collection, addDoc, query, where, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Subscription, EmailData } from './types';

export const subscriptionsCollection = collection(db, 'subscriptions');
export const emailsCollection = collection(db, 'emails');

export async function addSubscription(subscription: Omit<Subscription, 'id'>) {
  const docRef = await addDoc(subscriptionsCollection, subscription);
  return docRef.id;
}

export async function getSubscriptions(userId: string) {
  const q = query(subscriptionsCollection, where('userId', '==', userId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Subscription[];
}

export async function updateSubscription(id: string, data: Partial<Subscription>) {
  const docRef = doc(subscriptionsCollection, id);
  await updateDoc(docRef, data);
}

export async function addEmail(email: Omit<EmailData, 'id'>) {
  const docRef = await addDoc(emailsCollection, email);
  return docRef.id;
}

export async function saveUserGmailAuth(userId: string, authData: any) {
  const userDocRef = doc(db, 'users', userId);
  await setDoc(userDocRef, {
    gmailAuthorized: true,
    gmailAuthCode: authData.code,
    gmailTokens: authData.tokens,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

export async function getUserGmailAuth(userId: string) {
  const userDocRef = doc(db, 'users', userId);
  const userDoc = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
  return userDoc.docs[0]?.data();
}