export interface Change {
  field: string;
  old_value: string;
  new_value: string;
}

export interface IngestEventRequest {
  entity_id: string;
  entity_name: string;
  action: string;
  user_id: string;
  ip_address: string;
  user_agent: string;
  tenant: string;
  changes: Change[];
}

export interface IngestEventResponse {
  id: string;
}

export interface EventGrpcService {
  IngestEvent(request: IngestEventRequest, metadata?: unknown): unknown;
}
