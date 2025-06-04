import { initializeFirestore } from 'firebase/firestore';
import { app } from './firebase';
import { collection, addDoc, query, where, getDocs, doc, updateDoc, getFirestore } from 'firebase/firestore';
import type { Subscription, EmailData } from './types';

export const db = getFirestore(app);

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