async function wipe() {
    try {
        console.log("Wiping...");
        await fetch("https://alarma-comunitaria-4a6dd-default-rtdb.asia-southeast1.firebasedatabase.app/.json", {
            method: "DELETE"
        });
        console.log("Success");
    } catch(e) {
        console.error(e);
    }
}
wipe();
