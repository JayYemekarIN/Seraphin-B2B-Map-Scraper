let scrapedData = [];

async function startScrape() {
    const category = document.getElementById('categoryInput').value;
    const location = document.getElementById('locationInput').value;
    const btn = document.getElementById('scrapeBtn');
    const spinner = document.getElementById('loadingSpinner');
    const resultsArea = document.getElementById('resultsArea');
    const tableBody = document.getElementById('resultsTableBody');

    if (!category || !location) return alert("Please fill both fields");

    // UI Loading State
    btn.disabled = true;
    btn.innerText = "Processing (Max 50)..."; // Updated text
    spinner.classList.remove('d-none');
    resultsArea.classList.add('d-none');
    tableBody.innerHTML = '';

    try {
        const response = await fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, location })
        });

        const result = await response.json();

        if (result.success) {
            scrapedData = result.data;
            renderTable(result.data);
            resultsArea.classList.remove('d-none');
        } else {
            alert('Error: ' + result.error);
        }

    } catch (err) {
        console.error(err);
        alert('Something went wrong.');
    } finally {
        btn.disabled = false;
        btn.innerText = "GO";
        spinner.classList.add('d-none');
    }
}

function renderTable(data) {
    const tbody = document.getElementById('resultsTableBody');
    document.getElementById('countBadge').innerText = data.length;

    data.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.className = index % 2 === 0 ? 'row-even' : 'row-odd';
        
        // Helper to colorize "N/A"
        const emailClass = item.email === "N/A" ? "text-secondary" : "text-info";
        
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td class="fw-bold text-white">${item.name}</td>
            <td class="${emailClass}">${item.email}</td> <td style="color: #4ade80;">${item.phone}</td>
            <td class="text-secondary small">${item.address}</td>
        `;
        tbody.appendChild(tr);
    });
}

function exportToCSV() {
    if (!scrapedData.length) return;
    
    // Add Email to CSV Header
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Company Name,Email,Contact Number,Address\n";

    scrapedData.forEach(row => {
        // Clean data to prevent CSV breakage (remove commas inside text)
        const name = row.name.replace(/,/g, '');
        const email = row.email.replace(/,/g, '');
        const phone = row.phone.replace(/,/g, '');
        const address = row.address.replace(/,/g, ' ');

        const rowStr = `"${name}","${email}","${phone}","${address}"`;
        csvContent += rowStr + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "seraphin_leads_with_email.csv");
    document.body.appendChild(link);
    link.click();
}