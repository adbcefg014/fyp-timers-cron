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
let regularCronJobs = [];
const query = db.collection('commands');
query.onSnapshot(querySnapshot => {
    querySnapshot.docChanges().forEach(change => {
        if (change.doc.id === 'readIntervals') {
            if (change.type === 'added') {
                for (const [key, value] of Object.entries(change.doc.data())) {
                    if (cron.validate(value) === true) {
                        let job = cron.schedule(value, () => {
                            triggerRead(key, 1);
                        });
                        job.start();
                        regularCronJobs[key] = job;
                        console.log("Added regular cron for", key, " : ", value);
                    }
                }
            }
            if (change.type === 'modified') {
                for (const [key, value] of Object.entries(change.doc.data())) {
                    if (cron.validate(value) === true) {
                        let job = regularCronJobs[key];
                        job.stop();
                        job = cron.schedule(value, () => {
                            triggerRead(key, 1);
                        });
                        job.start();
                        regularCronJobs[key] = job;
                        console.log("Updated regular cron for", key, " : ", value);
                    }
                }
            }
        }
    })
})
/* END REGULAR INTERVAL READS */

/* CONTINUOUS READS */
let continuousRead;
let continuousCronJobs = [];
let notFirstInit = false;
const continuousDoc = query.doc('Legend');
continuousDoc.onSnapshot(docSnapshot => {
    let docData = docSnapshot.data();
    continuousRead = docData['continuousRead'];
    if (continuousRead === true) {
        for (const [key, value] of Object.entries(regularCronJobs)) {
            value.stop();
            triggerRead(key, 2);
            let newContinuousJob = cron.schedule("*/1 * * * *", () => {
                triggerRead(key, 2);
            });
            newContinuousJob.start();
            continuousCronJobs[key] = newContinuousJob;
        }
        console.log("continuous reads on");
    }
    if (continuousRead === false && notFirstInit === true) {
        for (const [key, value] of Object.entries(continuousCronJobs)) {
            value.stop();
            triggerRead(key, 1);
            delete continuousCronJobs[key];
        }
        for (const [key, value] of Object.entries(regularCronJobs)) {
            value.start();
        }
        console.log("continuous reads off");
    }
    notFirstInit = true;
})
/* END CONTINUOUS READS */

async function triggerRead(id, mode) {
    let updateObj = {};
    updateObj[id] = mode;
    query.doc('toRead').update(updateObj);
}

// Keys:
// 1 for turn off sensors after read
// 2 for sensors remain on after read