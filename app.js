const cron = require('node-cron');
const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./gcp_private_key.json');
initializeApp({
    credential: cert(serviceAccount)
});
const db = getFirestore();
console.log("Firebase authenticated!");

/* SETTING UP FOR REGULAR INTERVAL READS */
let devices = [];
let cronJobs = [];
const query = db.collection('commands');
query.onSnapshot(querySnapshot => {
    querySnapshot.docChanges().forEach(change => {
        if (change.doc.id === 'readIntervals') {
            if (change.type === 'added') {
                for (const [key, value] of Object.entries(change.doc.data())) {
                    devices.push(key);
                    let job = cron.schedule(value, () => {
                        triggerRead(key, 1);
                    });
                    job.start();
                    cronJobs[key] = job;
                }
                console.log('devices: ', devices);
            }
            if (change.type === 'modified') {
                for (const [key, value] of Object.entries(change.doc.data())) {
                    let job = cronJobs[key];
                    job.stop();
                    job = cron.schedule(value, () => {
                        triggerRead(key, 1);
                    });
                    job.start();
                    cronJobs[key] = job;
                }
            }
        }
    })
})
/* END REGULAR INTERVAL READS */

/* CONTINUOUS READS */
let continuousRead;
let notFirstInit = false;
const continuousDoc = query.doc('Legend');
continuousDoc.onSnapshot(docSnapshot => {
    let docData = docSnapshot.data();
    continuousRead = docData['continuousRead'];
    if (continuousRead === true) {
        cronJobs.forEach(job => {
            job.stop();
        })
        devices.forEach(id => {
            triggerRead(id, 2);
        })
    }
    if (continuousRead === false && notFirstInit === true) {
        devices.forEach(id => {
            triggerRead(id, 1);
        })
        cronJobs.forEach(job => {
            job.start();
        })
    }
    notFirstInit = true;
})
/* END CONTINUOUS READS */

async function triggerRead(id, mode) {
    let updateObj = {};
    updateObj[id] = mode;
    query.doc('toRead').update(updateObj);
}