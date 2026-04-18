use std::error::Error;
use zbus::{Connection, Proxy};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // Connect to the system Bus
    let connection = Connection::system().await?;

    //Create a Proxy to ur specific modem
    let proxy = Proxy::new(
        &connection,
        "org.freedesktop.ModemManager1",
        "/org/freedesktop/ModemManager1/Modem/0", //ur Modem Path
        "org.freedesktop.ModemManager1.Modem",
    )
    .await?;

    //Get Information properties of modem

    let manufacturer: Option<String> = proxy.get_property("Manufacturer").await.ok();
    let model: Option<String> = proxy.get_property("Model").await.ok();

    println!(
        "Connection to: {} {}",
        manufacturer.unwrap_or("Unknown".into()),
        model.unwrap_or("Unknown".into())
    );

    Ok(())
}
