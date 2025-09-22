import { describe, it, expect, beforeEach } from "vitest";
import {
	stringUtf8CV,
	uintCV,
	principalCV,
	boolCV,
} from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_TICKET_EXISTS = 101;
const ERR_INVALID_EVENT = 102;
const ERR_TICKET_NOT_FOUND = 103;
const ERR_NOT_OWNER = 104;
const ERR_NOT_TRANSFERABLE = 105;
const ERR_PRICE_VIOLATION = 106;
const ERR_INVALID_TIMESTAMP = 107;
const ERR_AUTHORITY_NOT_VERIFIED = 108;
const ERR_INVALID_TICKET_ID = 109;

interface Ticket {
	eventId: number;
	owner: string;
	isTransferable: boolean;
	purchasedAt: number;
	price: number;
}

interface TicketMetadata {
	eventName: string;
	ticketType: string;
	seatInfo: string;
}

interface Result<T> {
	ok: boolean;
	value: T;
}

class TicketOwnershipMock {
	state: {
		nextTicketId: number;
		authorityContract: string | null;
		tickets: Map<number, Ticket>;
		ticketMetadata: Map<number, TicketMetadata>;
	} = {
		nextTicketId: 0,
		authorityContract: null,
		tickets: new Map(),
		ticketMetadata: new Map(),
	};
	blockHeight: number = 0;
	caller: string = "ST1TEST";
	authorities: Set<string> = new Set(["ST1TEST"]);

	reset() {
		this.state = {
			nextTicketId: 0,
			authorityContract: null,
			tickets: new Map(),
			ticketMetadata: new Map(),
		};
		this.blockHeight = 0;
		this.caller = "ST1TEST";
		this.authorities = new Set(["ST1TEST"]);
	}

	setAuthorityContract(contractPrincipal: string): Result<boolean> {
		if (contractPrincipal === "SP000000000000000000002Q6VF78")
			return { ok: false, value: false };
		if (this.state.authorityContract !== null)
			return { ok: false, value: false };
		this.state.authorityContract = contractPrincipal;
		return { ok: true, value: true };
	}

	assignTicket(
		ticketId: number,
		eventId: number,
		owner: string,
		isTransferable: boolean,
		price: number,
		eventName: string,
		ticketType: string,
		seatInfo: string
	): Result<boolean> {
		if (this.state.tickets.has(ticketId))
			return { ok: false, value: ERR_TICKET_EXISTS };
		if (eventId < 0) return { ok: false, value: ERR_INVALID_EVENT };
		if (this.blockHeight < 0)
			return { ok: false, value: ERR_INVALID_TIMESTAMP };
		if (!this.state.authorityContract)
			return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
		this.state.tickets.set(ticketId, {
			eventId,
			owner,
			isTransferable,
			purchasedAt: this.blockHeight,
			price,
		});
		this.state.ticketMetadata.set(ticketId, {
			eventName,
			ticketType,
			seatInfo,
		});
		this.state.nextTicketId = ticketId + 1;
		return { ok: true, value: true };
	}

	transferTicket(ticketId: number, newOwner: string): Result<boolean> {
		const ticket = this.state.tickets.get(ticketId);
		if (!ticket) return { ok: false, value: ERR_TICKET_NOT_FOUND };
		if (ticket.owner !== this.caller)
			return { ok: false, value: ERR_NOT_OWNER };
		if (!ticket.isTransferable)
			return { ok: false, value: ERR_NOT_TRANSFERABLE };
		if (ticketId >= this.state.nextTicketId)
			return { ok: false, value: ERR_INVALID_TICKET_ID };
		this.state.tickets.set(ticketId, { ...ticket, owner: newOwner });
		return { ok: true, value: true };
	}

	verifyTicket(ticketId: number, owner: string): Result<boolean> {
		const ticket = this.state.tickets.get(ticketId);
		if (!ticket) return { ok: false, value: ERR_TICKET_NOT_FOUND };
		return { ok: true, value: ticket.owner === owner };
	}

	burnTicket(ticketId: number): Result<boolean> {
		const ticket = this.state.tickets.get(ticketId);
		if (!ticket) return { ok: false, value: ERR_TICKET_NOT_FOUND };
		if (ticket.owner !== this.caller)
			return { ok: false, value: ERR_NOT_OWNER };
		this.state.tickets.delete(ticketId);
		this.state.ticketMetadata.delete(ticketId);
		return { ok: true, value: true };
	}

	getTicketDetails(ticketId: number): Ticket | null {
		return this.state.tickets.get(ticketId) || null;
	}

	getTicketMetadata(ticketId: number): TicketMetadata | null {
		return this.state.ticketMetadata.get(ticketId) || null;
	}

	isTicketValid(ticketId: number): Result<boolean> {
		return { ok: true, value: this.state.tickets.has(ticketId) };
	}
}

describe("TicketOwnership", () => {
	let contract: TicketOwnershipMock;

	beforeEach(() => {
		contract = new TicketOwnershipMock();
		contract.reset();
	});

	it("assigns ticket successfully", () => {
		contract.setAuthorityContract("ST2TEST");
		const result = contract.assignTicket(
			0,
			1,
			"ST1TEST",
			true,
			100,
			"Concert",
			"VIP",
			"A1"
		);
		expect(result.ok).toBe(true);
		const ticket = contract.getTicketDetails(0);
		expect(ticket).toEqual({
			eventId: 1,
			owner: "ST1TEST",
			isTransferable: true,
			purchasedAt: 0,
			price: 100,
		});
		const metadata = contract.getTicketMetadata(0);
		expect(metadata).toEqual({
			eventName: "Concert",
			ticketType: "VIP",
			seatInfo: "A1",
		});
	});

	it("rejects duplicate ticket ID", () => {
		contract.setAuthorityContract("ST2TEST");
		contract.assignTicket(0, 1, "ST1TEST", true, 100, "Concert", "VIP", "A1");
		const result = contract.assignTicket(
			0,
			2,
			"ST1TEST",
			true,
			200,
			"Festival",
			"General",
			"B2"
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_TICKET_EXISTS);
	});

	it("transfers ticket successfully", () => {
		contract.setAuthorityContract("ST2TEST");
		contract.assignTicket(0, 1, "ST1TEST", true, 100, "Concert", "VIP", "A1");
		const result = contract.transferTicket(0, "ST3TEST");
		expect(result.ok).toBe(true);
		const ticket = contract.getTicketDetails(0);
		expect(ticket?.owner).toBe("ST3TEST");
	});

	it("rejects transfer of non-transferable ticket", () => {
		contract.setAuthorityContract("ST2TEST");
		contract.assignTicket(0, 1, "ST1TEST", false, 100, "Concert", "VIP", "A1");
		const result = contract.transferTicket(0, "ST3TEST");
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_NOT_TRANSFERABLE);
	});

	it("verifies ticket ownership correctly", () => {
		contract.setAuthorityContract("ST2TEST");
		contract.assignTicket(0, 1, "ST1TEST", true, 100, "Concert", "VIP", "A1");
		const result = contract.verifyTicket(0, "ST1TEST");
		expect(result.ok).toBe(true);
		expect(result.value).toBe(true);
	});

	it("burns ticket successfully", () => {
		contract.setAuthorityContract("ST2TEST");
		contract.assignTicket(0, 1, "ST1TEST", true, 100, "Concert", "VIP", "A1");
		const result = contract.burnTicket(0);
		expect(result.ok).toBe(true);
		expect(contract.getTicketDetails(0)).toBeNull();
		expect(contract.getTicketMetadata(0)).toBeNull();
	});

	it("rejects burn by non-owner", () => {
		contract.setAuthorityContract("ST2TEST");
		contract.assignTicket(0, 1, "ST1TEST", true, 100, "Concert", "VIP", "A1");
		contract.caller = "ST3TEST";
		const result = contract.burnTicket(0);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_NOT_OWNER);
	});

	it("rejects assignment without authority contract", () => {
		const result = contract.assignTicket(
			0,
			1,
			"ST1TEST",
			true,
			100,
			"Concert",
			"VIP",
			"A1"
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
	});

	it("checks ticket validity correctly", () => {
		contract.setAuthorityContract("ST2TEST");
		contract.assignTicket(0, 1, "ST1TEST", true, 100, "Concert", "VIP", "A1");
		const result = contract.isTicketValid(0);
		expect(result.ok).toBe(true);
		expect(result.value).toBe(true);
	});
});
