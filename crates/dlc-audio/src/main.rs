use anyhow::Result;

fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    tracing::info!("dlc-audio placeholder — audio analysis not yet implemented");
    Ok(())
}
